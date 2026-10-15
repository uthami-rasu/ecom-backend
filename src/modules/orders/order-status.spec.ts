import { OrderStatus } from './entities/order.entity.js';
import {
  ADMIN_STATUS_TITLES,
  ADMIN_TRANSITIONS,
  canAdminTransition,
  CUSTOMER_CANCELLABLE,
  REVENUE_STATUSES,
} from './order-status.js';
import {
  defaultEstimatedDelivery,
  generateOrderNumber,
} from './orders.service.js';

const S = OrderStatus;

describe('order status rules', () => {
  it.each([
    [OrderStatus.Paid, OrderStatus.Processing, true],
    [OrderStatus.Processing, OrderStatus.Shipped, true],
    [OrderStatus.Shipped, OrderStatus.Delivered, true],
    [OrderStatus.Paid, OrderStatus.Cancelled, true],
    [OrderStatus.PendingPayment, OrderStatus.Paid, false],
    [OrderStatus.PendingPayment, OrderStatus.Shipped, false],
    [OrderStatus.Shipped, OrderStatus.Cancelled, false],
    [OrderStatus.Delivered, OrderStatus.Processing, false],
    [OrderStatus.Cancelled, OrderStatus.Paid, false],
    [OrderStatus.Processing, OrderStatus.Packed, true],
    [OrderStatus.Packed, OrderStatus.Shipped, true],
    [OrderStatus.Packed, OrderStatus.Cancelled, true],
    [OrderStatus.Shipped, OrderStatus.OutForDelivery, true],
    [OrderStatus.OutForDelivery, OrderStatus.Delivered, true],
    [OrderStatus.Paid, OrderStatus.Packed, false],
    [OrderStatus.Packed, OrderStatus.Processing, false],
    [OrderStatus.Packed, OrderStatus.Delivered, false],
    [OrderStatus.OutForDelivery, OrderStatus.Cancelled, false],
    [OrderStatus.OutForDelivery, OrderStatus.Shipped, false],
    [OrderStatus.Delivered, OrderStatus.OutForDelivery, false],
  ])('%s → %s allowed: %s', (from, to, allowed) => {
    expect(canAdminTransition(from, to)).toBe(allowed);
  });

  it('matches the documented admin transition table exactly', () => {
    expect(ADMIN_TRANSITIONS).toEqual({
      [S.PendingPayment]: [S.Cancelled],
      [S.PaymentFailed]: [S.Cancelled],
      [S.Paid]: [S.Processing, S.Cancelled],
      [S.Processing]: [S.Packed, S.Shipped, S.Cancelled],
      [S.Packed]: [S.Shipped, S.Cancelled],
      [S.Shipped]: [S.OutForDelivery, S.Delivered],
      [S.OutForDelivery]: [S.Delivered],
      [S.Delivered]: [],
      [S.Cancelled]: [],
    });
  });

  it('never lets an admin mark an order paid or cancel it after shipping', () => {
    for (const [from, targets] of Object.entries(ADMIN_TRANSITIONS)) {
      expect(targets).not.toContain(S.Paid);
      expect(targets).not.toContain(S.PaymentFailed);
      if (
        [S.Shipped, S.OutForDelivery, S.Delivered].includes(from as OrderStatus)
      )
        expect(targets).not.toContain(S.Cancelled);
    }
  });

  it('has a timeline title for every admin target status', () => {
    const targets = new Set(Object.values(ADMIN_TRANSITIONS).flat());
    for (const status of targets)
      expect(ADMIN_STATUS_TITLES[status]).toEqual(expect.any(String));
    expect(ADMIN_STATUS_TITLES[S.Packed]).toBe('Packed and ready to ship');
  });

  it('counts every paid fulfilment stage as revenue', () => {
    expect(REVENUE_STATUSES).toEqual([
      S.Paid,
      S.Processing,
      S.Packed,
      S.Shipped,
      S.OutForDelivery,
      S.Delivered,
    ]);
  });

  it.each([
    ['express', 2],
    ['standard', 5],
    ['pickup', 1],
  ])('defaults the %s ETA to %i days after shipping', (method, days) => {
    const from = new Date('2026-10-15T10:00:00Z');
    expect(defaultEstimatedDelivery(method, from).getTime()).toBe(
      from.getTime() + days * 24 * 60 * 60 * 1000,
    );
  });

  it('lets customers cancel only unpaid orders', () => {
    expect(CUSTOMER_CANCELLABLE).toEqual([
      OrderStatus.PendingPayment,
      OrderStatus.PaymentFailed,
    ]);
  });

  it('generates unambiguous order numbers', () => {
    const numbers = new Set(Array.from({ length: 500 }, generateOrderNumber));
    expect(numbers.size).toBe(500);
    for (const number of numbers)
      expect(number).toMatch(/^BSC-[2-9A-HJKMNP-Z]{8}$/);
  });
});
