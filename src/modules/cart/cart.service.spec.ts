import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { CouponType } from '../coupons/coupon.entity.js';
import { CartService, lineIssue } from './cart.service.js';
import type { CartItem } from './entities/cart-item.entity.js';

const config = {
  get: () => ({
    freeThreshold: 99_900,
    standardFee: 4_900,
    expressFee: 15_000,
  }),
} as unknown as ConfigService;

const variant = (overrides: Record<string, unknown> = {}) => ({
  id: 'v1',
  productId: 'p1',
  label: '500g',
  price: 48_000,
  compareAtPrice: null,
  stock: 10,
  isActive: true,
  product: { id: 'p1', slug: 'melora', name: 'Melora', isActive: true },
  ...overrides,
});

describe('lineIssue', () => {
  const item = (v: ReturnType<typeof variant>, quantity = 1) =>
    ({ quantity, variant: v }) as unknown as CartItem;

  it('flags inactive variants or products', () => {
    expect(lineIssue(item(variant({ isActive: false })))).toBe(
      'This item is no longer available',
    );
    expect(lineIssue(item(variant({ product: { isActive: false } })))).toBe(
      'This item is no longer available',
    );
  });

  it('flags stock problems', () => {
    expect(lineIssue(item(variant({ stock: 0 })))).toBe('Out of stock');
    expect(lineIssue(item(variant({ stock: 2 }), 3))).toBe(
      'Only 2 left in stock',
    );
    expect(lineIssue(item(variant({ stock: 3 }), 3))).toBeNull();
  });
});

describe('CartService', () => {
  let carts: Record<string, ReturnType<typeof vi.fn>>;
  let items: Record<string, ReturnType<typeof vi.fn>>;
  let variants: Record<string, ReturnType<typeof vi.fn>>;
  let coupons: Record<string, ReturnType<typeof vi.fn>>;
  let service: CartService;

  const cartWith = (
    cartItems: unknown[],
    couponCode: string | null = null,
  ) => ({ id: 'cart-1', userId: 'u1', couponCode, items: cartItems });

  beforeEach(() => {
    const insertChain = {
      insert: () => insertChain,
      values: () => insertChain,
      orIgnore: () => insertChain,
      execute: vi.fn(),
    };
    carts = {
      findOne: vi.fn(async () => null),
      findOneBy: vi.fn(),
      findOneByOrFail: vi.fn(async () => ({ id: 'cart-1', userId: 'u1' })),
      update: vi.fn(),
      createQueryBuilder: vi.fn(() => insertChain),
    };
    items = {
      findOneBy: vi.fn(async () => null),
      upsert: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      createQueryBuilder: vi.fn(),
    };
    variants = { findOne: vi.fn(async () => variant()) };
    coupons = { findByCode: vi.fn() };
    const products = { primaryImages: vi.fn(async () => new Map()) };
    service = new CartService(
      carts as never,
      items as never,
      variants as never,
      coupons as never,
      products as never,
      config as never,
    );
  });

  it('returns an empty view when the user has no cart', async () => {
    await expect(service.getCart('u1')).resolves.toMatchObject({
      items: [],
      subtotal: 0,
      total: 0,
      coupon: null,
    });
  });

  it('rejects unknown or inactive variants', async () => {
    variants.findOne.mockResolvedValue(null);
    await expect(
      service.addItem('u1', { variantId: 'x', quantity: 1 }),
    ).rejects.toBeInstanceOf(NotFoundException);
    variants.findOne.mockResolvedValue(
      variant({ product: { isActive: false } }),
    );
    await expect(
      service.addItem('u1', { variantId: 'x', quantity: 1 }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('enforces stock and the per-line maximum including the existing quantity', async () => {
    items.findOneBy.mockResolvedValue({ quantity: 9 });
    await expect(
      service.addItem('u1', { variantId: 'v1', quantity: 2 }),
    ).rejects.toBeInstanceOf(ConflictException);

    variants.findOne.mockResolvedValue(variant({ stock: 100 }));
    items.findOneBy.mockResolvedValue({ quantity: 19 });
    await expect(
      service.addItem('u1', { variantId: 'v1', quantity: 2 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(items.upsert).not.toHaveBeenCalled();
  });

  it('upserts the combined quantity', async () => {
    items.findOneBy.mockResolvedValue({ quantity: 2 });
    await service.addItem('u1', { variantId: 'v1', quantity: 3 });
    expect(items.upsert).toHaveBeenCalledWith(
      { cartId: 'cart-1', variantId: 'v1', quantity: 5 },
      ['cartId', 'variantId'],
    );
  });

  it('computes totals with a valid coupon and excludes unavailable lines', async () => {
    carts.findOne.mockResolvedValue(
      cartWith(
        [
          { id: 'i1', quantity: 2, variant: variant() },
          { id: 'i2', quantity: 1, variant: variant({ id: 'v2', stock: 0 }) },
        ],
        'WELCOME10',
      ),
    );
    coupons.findByCode.mockResolvedValue({
      type: CouponType.Percentage,
      value: 10,
      minSubtotal: 0,
      maxDiscount: null,
      usageLimit: null,
      usedCount: 0,
      isActive: true,
      startsAt: null,
      expiresAt: null,
    });

    const view = await service.getCart('u1');
    expect(view).toMatchObject({
      subtotal: 960,
      discount: 96,
      shippingFee: 49,
      total: 913,
      coupon: { code: 'WELCOME10', discount: 96 },
    });
    expect(view.items[1]).toMatchObject({
      available: false,
      issue: 'Out of stock',
    });
    expect(view.itemCount).toBe(3);
  });

  it('reports why a stored coupon no longer applies', async () => {
    carts.findOne.mockResolvedValue(
      cartWith([{ id: 'i1', quantity: 1, variant: variant() }], 'OLD'),
    );
    coupons.findByCode.mockResolvedValue(null);
    const view = await service.getCart('u1');
    expect(view).toMatchObject({
      coupon: null,
      couponError: 'Coupon code is not valid',
      discount: 0,
    });
  });

  it('refuses coupons on an empty cart or when invalid', async () => {
    await expect(service.applyCoupon('u1', 'WELCOME10')).rejects.toThrow(
      'Add items to your cart',
    );
    carts.findOne.mockResolvedValue(
      cartWith([{ id: 'i1', quantity: 1, variant: variant() }]),
    );
    coupons.findByCode.mockResolvedValue(null);
    await expect(service.applyCoupon('u1', 'NOPE')).rejects.toThrow(
      'Coupon code is not valid',
    );
    expect(carts.update).not.toHaveBeenCalled();
  });
});
