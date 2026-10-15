/**
 * Pure pricing rules shared by the cart preview and checkout. All amounts are paise.
 * Keeping these free of I/O makes them trivially unit-testable and guarantees the
 * cart and the order compute identical totals.
 */
import { CouponType } from '../coupons/coupon.entity.js';

export const SHIPPING_METHODS = ['standard', 'express', 'pickup'] as const;
export type ShippingMethod = (typeof SHIPPING_METHODS)[number];

export interface ShippingRules {
  freeThreshold: number;
  standardFee: number;
  expressFee: number;
}

export interface ShippingOption {
  method: ShippingMethod;
  label: string;
  fee: number;
}

export interface CouponRule {
  code: string;
  type: CouponType;
  value: number;
  minSubtotal: number;
  maxDiscount: number | null;
  startsAt: Date | null;
  expiresAt: Date | null;
  usageLimit: number | null;
  usedCount: number;
  isActive: boolean;
}

export type CouponEvaluation =
  { valid: true; discount: number } | { valid: false; reason: string };

export interface PricedLine {
  unitPrice: number;
  quantity: number;
}

export interface Totals {
  subtotal: number;
  discount: number;
  shippingFee: number;
  total: number;
}

export function subtotalOf(lines: PricedLine[]): number {
  return lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0);
}

export function evaluateCoupon(
  coupon: CouponRule | null,
  subtotal: number,
  now = new Date(),
): CouponEvaluation {
  if (!coupon || !coupon.isActive)
    return { valid: false, reason: 'Coupon code is not valid' };
  if (coupon.startsAt && coupon.startsAt > now)
    return { valid: false, reason: 'Coupon is not active yet' };
  if (coupon.expiresAt && coupon.expiresAt <= now)
    return { valid: false, reason: 'Coupon has expired' };
  if (coupon.usageLimit !== null && coupon.usedCount >= coupon.usageLimit) {
    return { valid: false, reason: 'Coupon usage limit has been reached' };
  }
  if (subtotal < coupon.minSubtotal) {
    return {
      valid: false,
      reason: `Add ₹${(coupon.minSubtotal - subtotal) / 100} more to use this coupon`,
    };
  }

  let discount =
    coupon.type === CouponType.Percentage
      ? Math.floor((subtotal * coupon.value) / 100)
      : coupon.value;
  if (coupon.maxDiscount !== null)
    discount = Math.min(discount, coupon.maxDiscount);
  return { valid: true, discount: Math.max(0, Math.min(discount, subtotal)) };
}

/** Free standard shipping applies once the discounted subtotal reaches the threshold. */
export function shippingOptions(
  discountedSubtotal: number,
  rules: ShippingRules,
): ShippingOption[] {
  const freeStandard = discountedSubtotal >= rules.freeThreshold;
  return [
    {
      method: 'standard',
      label: freeStandard ? 'Free shipping' : 'Standard shipping',
      fee: freeStandard ? 0 : rules.standardFee,
    },
    { method: 'express', label: 'Express shipping', fee: rules.expressFee },
    { method: 'pickup', label: 'Store pickup', fee: 0 },
  ];
}

export function computeTotals(
  lines: PricedLine[],
  method: ShippingMethod,
  rules: ShippingRules,
  couponDiscount = 0,
): Totals & { options: ShippingOption[] } {
  const subtotal = subtotalOf(lines);
  const discount = Math.min(couponDiscount, subtotal);
  const options = shippingOptions(subtotal - discount, rules);
  const shippingFee = lines.length
    ? options.find((option) => option.method === method)!.fee
    : 0;
  return {
    subtotal,
    discount,
    shippingFee,
    total: subtotal - discount + shippingFee,
    options,
  };
}
