import { toRupees } from '../../common/utils/money.js';
import type { PaymentStatus } from '../payments/payment.entity.js';
import type {
  OrderEvent,
  OrderEventActor,
} from './entities/order-event.entity.js';
import type { OrderItem } from './entities/order-item.entity.js';
import type {
  Order,
  OrderAddress,
  OrderStatus,
} from './entities/order.entity.js';

export interface OrderItemView {
  id: string;
  productId: string | null;
  productSlug: string;
  productName: string;
  variantLabel: string;
  sku: string;
  imageUrl: string | null;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
}

export interface OrderTracking {
  carrier: string | null;
  trackingNumber: string | null;
  trackingUrl: string | null;
  estimatedDeliveryAt: Date | null;
  shippedAt: Date | null;
  deliveredAt: Date | null;
}

export interface OrderEventView {
  id: string;
  status: OrderStatus | null;
  title: string;
  note: string | null;
  actor: OrderEventActor;
  createdAt: Date;
}

export interface OrderView {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus | null;
  currency: string;
  subtotal: number;
  discount: number;
  shippingFee: number;
  total: number;
  couponCode: string | null;
  shippingMethod: string;
  shippingAddress: OrderAddress;
  billingAddress: OrderAddress;
  contactEmail: string;
  notes: string | null;
  itemCount: number;
  items: OrderItemView[];
  createdAt: Date;
  paidAt: Date | null;
  cancelledAt: Date | null;
  tracking: OrderTracking;
  /** Oldest first; only on detail endpoints. */
  timeline?: OrderEventView[];
}

export const toOrderItemView = (item: OrderItem): OrderItemView => ({
  id: item.id,
  productId: item.productId,
  productSlug: item.productSlug,
  productName: item.productName,
  variantLabel: item.variantLabel,
  sku: item.sku,
  imageUrl: item.imageUrl,
  unitPrice: toRupees(item.unitPrice),
  quantity: item.quantity,
  lineTotal: toRupees(item.lineTotal),
});

export const toOrderTracking = (order: Order): OrderTracking => ({
  carrier: order.carrier,
  trackingNumber: order.trackingNumber,
  trackingUrl: order.trackingUrl,
  estimatedDeliveryAt: order.estimatedDeliveryAt,
  shippedAt: order.shippedAt,
  deliveredAt: order.deliveredAt,
});

/** The acting user's id stays internal; customers only see who (system/customer/admin) acted. */
export const toOrderEventView = (event: OrderEvent): OrderEventView => ({
  id: event.id,
  status: event.status,
  title: event.title,
  note: event.note,
  actor: event.actor,
  createdAt: event.createdAt,
});

export const toOrderView = (
  order: Order,
  items: OrderItem[],
  paymentStatus: PaymentStatus | null,
): OrderView => ({
  id: order.id,
  orderNumber: order.orderNumber,
  status: order.status,
  paymentStatus,
  currency: order.currency,
  subtotal: toRupees(order.subtotal),
  discount: toRupees(order.discount),
  shippingFee: toRupees(order.shippingFee),
  total: toRupees(order.total),
  couponCode: order.couponCode,
  shippingMethod: order.shippingMethod,
  shippingAddress: order.shippingAddress,
  billingAddress: order.billingAddress,
  contactEmail: order.contactEmail,
  notes: order.notes,
  itemCount: items.reduce((sum, item) => sum + item.quantity, 0),
  items: items.map(toOrderItemView),
  createdAt: order.createdAt,
  paidAt: order.paidAt,
  cancelledAt: order.cancelledAt,
  tracking: toOrderTracking(order),
});
