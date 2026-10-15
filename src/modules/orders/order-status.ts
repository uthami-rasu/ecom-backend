import { OrderStatus } from './entities/order.entity.js';

/**
 * Transitions an administrator may perform. Payment-driven transitions
 * (pending_payment → paid / payment_failed) happen only through PaymentsService.
 *
 * Lifecycle: pending_payment → paid → processing ("Confirmed") → packed → shipped
 * → out_for_delivery → delivered. Packing and out-for-delivery are optional steps;
 * cancelling is possible until the parcel has shipped.
 */
export const ADMIN_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  [OrderStatus.PendingPayment]: [OrderStatus.Cancelled],
  [OrderStatus.PaymentFailed]: [OrderStatus.Cancelled],
  [OrderStatus.Paid]: [OrderStatus.Processing, OrderStatus.Cancelled],
  [OrderStatus.Processing]: [
    OrderStatus.Packed,
    OrderStatus.Shipped,
    OrderStatus.Cancelled,
  ],
  [OrderStatus.Packed]: [OrderStatus.Shipped, OrderStatus.Cancelled],
  [OrderStatus.Shipped]: [OrderStatus.OutForDelivery, OrderStatus.Delivered],
  [OrderStatus.OutForDelivery]: [OrderStatus.Delivered],
  [OrderStatus.Delivered]: [],
  [OrderStatus.Cancelled]: [],
};

/** Timeline titles for admin-driven status changes. */
export const ADMIN_STATUS_TITLES: Partial<Record<OrderStatus, string>> = {
  [OrderStatus.Processing]: 'Order confirmed',
  [OrderStatus.Packed]: 'Packed and ready to ship',
  [OrderStatus.Shipped]: 'Shipped',
  [OrderStatus.OutForDelivery]: 'Out for delivery',
  [OrderStatus.Delivered]: 'Delivered',
  [OrderStatus.Cancelled]: 'Cancelled by store',
};

/** Days until the default estimated delivery, by shipping method (set when an order ships). */
export const DEFAULT_DELIVERY_DAYS: Record<string, number> = {
  express: 2,
  standard: 5,
  pickup: 1,
};

export const canAdminTransition = (
  from: OrderStatus,
  to: OrderStatus,
): boolean => ADMIN_TRANSITIONS[from].includes(to);

/** Customers may cancel only before money has been taken. */
export const CUSTOMER_CANCELLABLE = [
  OrderStatus.PendingPayment,
  OrderStatus.PaymentFailed,
];

/** Statuses in which a payment attempt may be started. */
export const PAYABLE_STATUSES = [
  OrderStatus.PendingPayment,
  OrderStatus.PaymentFailed,
];

/** Orders that count as revenue. */
export const REVENUE_STATUSES = [
  OrderStatus.Paid,
  OrderStatus.Processing,
  OrderStatus.Packed,
  OrderStatus.Shipped,
  OrderStatus.OutForDelivery,
  OrderStatus.Delivered,
];
