import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CouponType } from './coupon.entity.js';
import { CouponsService } from './coupons.service.js';

describe('CouponsService', () => {
  let repo: Record<string, ReturnType<typeof vi.fn>>;
  let service: CouponsService;

  beforeEach(() => {
    repo = {
      create: vi.fn((value) => ({
        id: 'c1',
        usedCount: 0,
        isActive: true,
        description: null,
        maxDiscount: null,
        minSubtotal: 0,
        startsAt: null,
        expiresAt: null,
        usageLimit: null,
        ...value,
      })),
      save: vi.fn(async (value) => value),
      findOneBy: vi.fn(),
      delete: vi.fn(async () => ({ affected: 0 })),
    };
    service = new CouponsService(repo as never);
  });

  it('stores fixed amounts in paise but percentages as-is', async () => {
    const fixed = await service.create({
      code: 'FLAT50',
      type: CouponType.Fixed,
      value: 50,
      minSubtotal: 499,
    });
    expect(repo.create).toHaveBeenLastCalledWith(
      expect.objectContaining({ value: 5_000, minSubtotal: 49_900 }),
    );
    expect(fixed).toMatchObject({ value: 50, minSubtotal: 499 });

    await service.create({
      code: 'TEN',
      type: CouponType.Percentage,
      value: 10,
      maxDiscount: 200,
    });
    expect(repo.create).toHaveBeenLastCalledWith(
      expect.objectContaining({ value: 10, maxDiscount: 20_000 }),
    );
  });

  it('rejects out-of-range percentages and inverted date ranges', async () => {
    await expect(
      service.create({ code: 'HUGE', type: CouponType.Percentage, value: 150 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.create({
        code: 'DATES',
        type: CouponType.Fixed,
        value: 5,
        startsAt: new Date('2026-12-01'),
        expiresAt: new Date('2026-11-01'),
      }),
    ).rejects.toThrow('expiresAt must be after startsAt');
  });

  it('keeps the existing type when updating only the value', async () => {
    repo.findOneBy.mockResolvedValue({
      id: 'c1',
      code: 'FLAT',
      type: CouponType.Fixed,
      value: 1_000,
      minSubtotal: 0,
      maxDiscount: null,
      usedCount: 0,
      isActive: true,
    });
    const updated = await service.update('c1', { value: 75 });
    expect(updated.value).toBe(75);
    expect(repo.save).toHaveBeenLastCalledWith(
      expect.objectContaining({ value: 7_500 }),
    );
  });

  it('404s for unknown coupons', async () => {
    repo.findOneBy.mockResolvedValue(null);
    await expect(service.get('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(service.update('missing', {})).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(service.remove('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
