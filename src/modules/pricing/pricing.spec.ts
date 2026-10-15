import { CouponType } from '../coupons/coupon.entity.js';
import {
  computeTotals,
  evaluateCoupon,
  shippingOptions,
  subtotalOf,
  type CouponRule,
} from './pricing.js';

const rules = { freeThreshold: 99_900, standardFee: 4_900, expressFee: 15_000 };

const coupon = (overrides: Partial<CouponRule> = {}): CouponRule => ({
  code: 'TEST',
  type: CouponType.Percentage,
  value: 10,
  minSubtotal: 0,
  maxDiscount: null,
  startsAt: null,
  expiresAt: null,
  usageLimit: null,
  usedCount: 0,
  isActive: true,
  ...overrides,
});

describe('pricing', () => {
  it('sums line totals', () => {
    expect(
      subtotalOf([
        { unitPrice: 48_000, quantity: 2 },
        { unitPrice: 100, quantity: 3 },
      ]),
    ).toBe(96_300);
  });

  describe('evaluateCoupon', () => {
    const now = new Date('2026-10-15T00:00:00Z');

    it.each([
      ['missing coupon', null, 'Coupon code is not valid'],
      ['inactive', coupon({ isActive: false }), 'Coupon code is not valid'],
      [
        'not started',
        coupon({ startsAt: new Date('2026-11-01') }),
        'Coupon is not active yet',
      ],
      [
        'expired',
        coupon({ expiresAt: new Date('2026-10-01') }),
        'Coupon has expired',
      ],
      [
        'exhausted',
        coupon({ usageLimit: 5, usedCount: 5 }),
        'Coupon usage limit has been reached',
      ],
      [
        'below minimum',
        coupon({ minSubtotal: 50_000 }),
        'Add ₹200 more to use this coupon',
      ],
    ])('rejects a %s coupon', (_label, rule, reason) => {
      expect(evaluateCoupon(rule, 30_000, now)).toEqual({
        valid: false,
        reason,
      });
    });

    it('applies percentage discounts, floored to the paisa', () => {
      expect(evaluateCoupon(coupon({ value: 10 }), 79_999, now)).toEqual({
        valid: true,
        discount: 7_999,
      });
    });

    it('caps percentage discounts at maxDiscount', () => {
      expect(
        evaluateCoupon(
          coupon({ value: 50, maxDiscount: 20_000 }),
          100_000,
          now,
        ),
      ).toEqual({ valid: true, discount: 20_000 });
    });

    it('never discounts more than the subtotal', () => {
      expect(
        evaluateCoupon(
          coupon({ type: CouponType.Fixed, value: 50_000 }),
          30_000,
          now,
        ),
      ).toEqual({ valid: true, discount: 30_000 });
    });
  });

  describe('shippingOptions', () => {
    it('charges standard shipping below the threshold', () => {
      expect(shippingOptions(99_899, rules)[0]).toEqual({
        method: 'standard',
        label: 'Standard shipping',
        fee: 4_900,
      });
    });

    it('makes standard shipping free at the threshold', () => {
      expect(shippingOptions(99_900, rules)[0]).toEqual({
        method: 'standard',
        label: 'Free shipping',
        fee: 0,
      });
    });

    it('always offers express and free pickup', () => {
      const options = shippingOptions(0, rules);
      expect(options.find((o) => o.method === 'express')?.fee).toBe(15_000);
      expect(options.find((o) => o.method === 'pickup')?.fee).toBe(0);
    });
  });

  describe('computeTotals', () => {
    it('evaluates free shipping on the discounted subtotal', () => {
      const totals = computeTotals(
        [{ unitPrice: 100_000, quantity: 1 }],
        'standard',
        rules,
        2_000,
      );
      expect(totals).toMatchObject({
        subtotal: 100_000,
        discount: 2_000,
        shippingFee: 4_900,
        total: 102_900,
      });
    });

    it('charges nothing for an empty cart', () => {
      expect(computeTotals([], 'express', rules)).toMatchObject({
        subtotal: 0,
        shippingFee: 0,
        total: 0,
      });
    });

    it('adds express shipping', () => {
      expect(
        computeTotals([{ unitPrice: 149_000, quantity: 1 }], 'express', rules)
          .total,
      ).toBe(164_000);
    });
  });
});
