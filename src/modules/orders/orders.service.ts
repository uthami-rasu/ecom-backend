import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { randomInt } from 'node:crypto';
import { DataSource, In, Repository, type EntityManager } from 'typeorm';
import type { AuthUser } from '../../common/decorators/current-user.decorator.js';
import {
  offsetOf,
  paginate,
  type Paginated,
  type PaginationQueryDto,
} from '../../common/dto/pagination.dto.js';
import { toRupees } from '../../common/utils/money.js';
import { escapeLike } from '../../common/utils/text.js';
import type { AppConfig } from '../../config/configuration.js';
import { lineIssue } from '../cart/cart.service.js';
import { CartItem } from '../cart/entities/cart-item.entity.js';
import { Cart } from '../cart/entities/cart.entity.js';
import { CouponsService } from '../coupons/coupons.service.js';
import { Payment, PaymentStatus } from '../payments/payment.entity.js';
import {
  computeTotals,
  evaluateCoupon,
  type ShippingRules,
} from '../pricing/pricing.js';
import { ProductVariant } from '../products/entities/product-variant.entity.js';
import { ProductsService } from '../products/products.service.js';
import { AddressesService } from '../users/addresses.service.js';
import type { AddressFieldsDto } from '../users/dto/address.dto.js';
import type { Address } from '../users/entities/address.entity.js';
import { User } from '../users/entities/user.entity.js';
import type {
  CreateOrderEventDto,
  UpdateOrderStatusDto,
  UpdateOrderTrackingDto,
} from './dto/admin-order.dto.js';
import type { CheckoutDto } from './dto/checkout.dto.js';
import type { AdminOrderQueryDto } from './dto/order-query.dto.js';
import { OrderEvent, OrderEventActor } from './entities/order-event.entity.js';
import { OrderItem } from './entities/order-item.entity.js';
import {
  Order,
  OrderStatus,
  type OrderAddress,
} from './entities/order.entity.js';
import {
  toOrderEventView,
  toOrderTracking,
  toOrderView,
  type OrderTracking,
  type OrderView,
} from './order.mapper.js';
import { OrderNotifier } from './order-notifier.service.js';
import {
  ADMIN_STATUS_TITLES,
  ADMIN_TRANSITIONS,
  canAdminTransition,
  CUSTOMER_CANCELLABLE,
  DEFAULT_DELIVERY_DAYS,
} from './order-status.js';

/** Unambiguous characters (no 0/O, 1/I/L) for human-friendly order numbers. */
const ORDER_NUMBER_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

export function generateOrderNumber(): string {
  let suffix = '';
  for (let i = 0; i < 8; i += 1)
    suffix += ORDER_NUMBER_ALPHABET[randomInt(ORDER_NUMBER_ALPHABET.length)];
  return `BSC-${suffix}`;
}

const toSnapshot = (address: AddressFieldsDto | Address): OrderAddress => ({
  firstName: address.firstName,
  lastName: address.lastName,
  phone: address.phone,
  line1: address.line1,
  line2: address.line2 ?? null,
  city: address.city,
  state: address.state,
  postalCode: address.postalCode,
  country: address.country ?? 'IN',
});

const DAY_MS = 24 * 60 * 60 * 1000;

/** Default ETA when an order ships without one: now + days for its shipping method. */
export const defaultEstimatedDelivery = (
  shippingMethod: string,
  from = new Date(),
): Date =>
  new Date(
    from.getTime() + (DEFAULT_DELIVERY_DAYS[shippingMethod] ?? 5) * DAY_MS,
  );

/**
 * An ETA earlier than the start of the current (UTC) day is rejected; a date-only value
 * for today (midnight) is still accepted.
 */
function assertEtaNotPast(eta: Date | null | undefined): void {
  if (!eta) return;
  const startOfToday = new Date();
  startOfToday.setUTCHours(0, 0, 0, 0);
  if (eta.getTime() < startOfToday.getTime())
    throw new BadRequestException(
      'estimatedDeliveryAt must not be in the past',
    );
}

type TrackingChanges = Partial<
  Pick<
    Order,
    'carrier' | 'trackingNumber' | 'trackingUrl' | 'estimatedDeliveryAt'
  >
>;

/** Only the fields present in the request; `null` clears a value. */
function trackingChanges(dto: TrackingChanges): TrackingChanges {
  const changes: TrackingChanges = {};
  if (dto.carrier !== undefined) changes.carrier = dto.carrier;
  if (dto.trackingNumber !== undefined)
    changes.trackingNumber = dto.trackingNumber;
  if (dto.trackingUrl !== undefined) changes.trackingUrl = dto.trackingUrl;
  if (dto.estimatedDeliveryAt !== undefined)
    changes.estimatedDeliveryAt = dto.estimatedDeliveryAt;
  return changes;
}

/** Status changes that email the customer (when notifyCustomer is not false). */
const STATUS_MAILS = {
  [OrderStatus.Shipped]: 'shipped',
  [OrderStatus.OutForDelivery]: 'out_for_delivery',
  [OrderStatus.Delivered]: 'delivered',
  [OrderStatus.Cancelled]: 'cancelled',
} as const satisfies Partial<Record<OrderStatus, string>>;

interface NewOrderEvent {
  status: OrderStatus | null;
  title: string;
  note?: string | null;
  actor: OrderEventActor;
  actorUserId?: string | null;
}

export interface AdminOrderListItem {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus | null;
  customerName: string;
  contactEmail: string;
  itemCount: number;
  total: number;
  tracking: OrderTracking;
  createdAt: Date;
}

export type AdminOrderDetail = OrderView & {
  allowedTransitions: OrderStatus[];
  customer: Pick<
    User,
    'id' | 'email' | 'firstName' | 'lastName' | 'phone'
  > | null;
};

@Injectable()
export class OrdersService {
  private readonly shippingRules: ShippingRules;

  constructor(
    @InjectRepository(Order) private readonly orders: Repository<Order>,
    @InjectRepository(OrderItem)
    private readonly orderItems: Repository<OrderItem>,
    @InjectRepository(Payment) private readonly payments: Repository<Payment>,
    @InjectRepository(OrderEvent)
    private readonly events: Repository<OrderEvent>,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly dataSource: DataSource,
    private readonly notifier: OrderNotifier,
    private readonly addresses: AddressesService,
    private readonly coupons: CouponsService,
    private readonly products: ProductsService,
    config: ConfigService<AppConfig, true>,
  ) {
    this.shippingRules = config.get('shipping', { infer: true });
  }

  /**
   * Converts the user's cart into an order awaiting payment. Everything happens in one
   * transaction: the cart row is locked (no double checkout), stock is decremented with
   * conditional updates (no overselling) and the coupon use is consumed atomically.
   */
  async checkout(user: AuthUser, dto: CheckoutDto): Promise<OrderView> {
    const shippingAddress = await this.resolveAddress(
      user.id,
      dto.shippingAddressId,
      dto.shippingAddress,
    );
    if (!shippingAddress)
      throw new BadRequestException(
        'Provide shippingAddressId or shippingAddress',
      );
    const billingAddress =
      (await this.resolveAddress(
        user.id,
        dto.billingAddressId,
        dto.billingAddress,
      )) ?? shippingAddress;

    const orderId = await this.dataSource.transaction(async (manager) => {
      const cart = await manager
        .getRepository(Cart)
        .createQueryBuilder('cart')
        .setLock('pessimistic_write')
        .where('cart.userId = :userId', { userId: user.id })
        .getOne();
      const items = cart
        ? await manager.getRepository(CartItem).find({
            where: { cartId: cart.id },
            relations: { variant: { product: true } },
            order: { createdAt: 'ASC' },
          })
        : [];
      if (!cart || !items.length)
        throw new BadRequestException('Your cart is empty');

      const unavailable = items.filter((item) => lineIssue(item));
      if (unavailable.length) {
        throw new ConflictException({
          message: 'Some items in your cart are unavailable',
          items: unavailable.map((item) => ({
            cartItemId: item.id,
            issue: lineIssue(item),
          })),
        });
      }

      // Lock variants in a stable order to avoid deadlocks between concurrent checkouts.
      for (const item of [...items].sort((a, b) =>
        a.variantId.localeCompare(b.variantId),
      )) {
        const result = await manager
          .createQueryBuilder()
          .update(ProductVariant)
          .set({ stock: () => 'stock - :quantity' })
          .where('id = :id AND is_active = true AND stock >= :quantity')
          .setParameters({ id: item.variantId, quantity: item.quantity })
          .execute();
        if (!result.affected) {
          throw new ConflictException(
            `${item.variant!.product!.name} (${item.variant!.label}) just sold out`,
          );
        }
      }

      const lines = items.map((item) => ({
        unitPrice: item.variant!.price,
        quantity: item.quantity,
      }));
      let discount = 0;
      let couponId: string | null = null;
      if (cart.couponCode) {
        const subtotal = computeTotals(
          lines,
          dto.shippingMethod,
          this.shippingRules,
        ).subtotal;
        const coupon = await this.coupons.findByCode(cart.couponCode, manager);
        const evaluation = evaluateCoupon(coupon, subtotal);
        if (!evaluation.valid)
          throw new ConflictException(
            `Coupon ${cart.couponCode} can no longer be applied: ${evaluation.reason}`,
          );
        if (!(await this.coupons.consume(manager, coupon!.id))) {
          throw new ConflictException(
            `Coupon ${cart.couponCode} has reached its usage limit`,
          );
        }
        discount = evaluation.discount;
        couponId = coupon!.id;
      }
      const totals = computeTotals(
        lines,
        dto.shippingMethod,
        this.shippingRules,
        discount,
      );
      const images = await this.products.primaryImages([
        ...new Set(items.map((item) => item.variant!.productId)),
      ]);

      const order = await manager.getRepository(Order).save(
        manager.getRepository(Order).create({
          orderNumber: generateOrderNumber(),
          userId: user.id,
          status: OrderStatus.PendingPayment,
          subtotal: totals.subtotal,
          discount: totals.discount,
          shippingFee: totals.shippingFee,
          total: totals.total,
          couponCode: couponId ? cart.couponCode : null,
          couponId,
          shippingMethod: dto.shippingMethod,
          shippingAddress,
          billingAddress,
          contactEmail: dto.email ?? user.email,
          notes: dto.notes || null,
        }),
      );
      await manager.getRepository(OrderItem).save(
        items.map((item) =>
          manager.getRepository(OrderItem).create({
            orderId: order.id,
            productId: item.variant!.productId,
            variantId: item.variantId,
            productName: item.variant!.product!.name,
            productSlug: item.variant!.product!.slug,
            variantLabel: item.variant!.label,
            sku: item.variant!.sku,
            imageUrl: images.get(item.variant!.productId)?.thumbUrl ?? null,
            unitPrice: item.variant!.price,
            quantity: item.quantity,
            lineTotal: item.variant!.price * item.quantity,
          }),
        ),
      );
      await this.recordEvent(manager, order.id, {
        status: OrderStatus.PendingPayment,
        title: 'Order placed',
        actor: OrderEventActor.Customer,
        actorUserId: user.id,
      });
      await manager.getRepository(CartItem).delete({ cartId: cart.id });
      await manager
        .getRepository(Cart)
        .update({ id: cart.id }, { couponCode: null });
      return order.id;
    });

    return this.view(await this.orders.findOneByOrFail({ id: orderId }));
  }

  async listForUser(
    userId: string,
    query: PaginationQueryDto,
  ): Promise<Paginated<OrderView>> {
    const [orders, total] = await this.orders.findAndCount({
      where: { userId },
      order: { createdAt: 'DESC', id: 'ASC' },
      skip: offsetOf(query),
      take: query.limit,
    });
    return paginate(await this.views(orders), total, query);
  }

  async getForUser(userId: string, orderNumber: string): Promise<OrderView> {
    return this.detail(await this.findOwned(userId, orderNumber));
  }

  /** Ownership is part of the lookup: another user's order is indistinguishable from a missing one. */
  async findOwned(userId: string, orderNumber: string): Promise<Order> {
    const order = await this.orders.findOneBy({
      orderNumber: orderNumber.toUpperCase(),
      userId,
    });
    if (!order) throw new NotFoundException('Order not found');
    return order;
  }

  async cancelForUser(userId: string, orderNumber: string): Promise<OrderView> {
    const order = await this.findOwned(userId, orderNumber);
    if (!CUSTOMER_CANCELLABLE.includes(order.status)) {
      throw new ConflictException(
        'This order can no longer be cancelled online; please contact support',
      );
    }
    const view = await this.cancel(order.id, CUSTOMER_CANCELLABLE, {
      status: OrderStatus.Cancelled,
      title: 'Cancelled by customer',
      actor: OrderEventActor.Customer,
      actorUserId: userId,
    });
    this.notifier.notify(order.id, 'cancelled');
    return view;
  }

  // ── Payment-driven transitions (called by PaymentsService inside its transaction) ──

  /** Returns whether the order actually moved to paid (false when already paid/cancelled). */
  async markPaid(manager: EntityManager, orderId: string): Promise<boolean> {
    const result = await manager
      .createQueryBuilder()
      .update(Order)
      .set({ status: OrderStatus.Paid, paidAt: () => 'now()' })
      .where('id = :orderId', { orderId })
      .andWhere('status IN (:...statuses)', {
        statuses: [OrderStatus.PendingPayment, OrderStatus.PaymentFailed],
      })
      .execute();
    if (!result.affected) return false;
    await this.recordEvent(manager, orderId, {
      status: OrderStatus.Paid,
      title: 'Payment received',
      actor: OrderEventActor.System,
    });
    return true;
  }

  async markPaymentFailed(
    manager: EntityManager,
    orderId: string,
  ): Promise<void> {
    const result = await manager
      .createQueryBuilder()
      .update(Order)
      .set({ status: OrderStatus.PaymentFailed })
      .where('id = :orderId AND status = :status', {
        orderId,
        status: OrderStatus.PendingPayment,
      })
      .execute();
    if (result.affected)
      await this.recordEvent(manager, orderId, {
        status: OrderStatus.PaymentFailed,
        title: 'Payment failed',
        actor: OrderEventActor.System,
      });
  }

  /** "Order confirmed" email; call after the payment transaction has committed. */
  notifyPaid(orderId: string): void {
    this.notifier.notify(orderId, 'paid');
  }

  async reopenForPayment(
    manager: EntityManager,
    orderId: string,
  ): Promise<void> {
    await manager
      .createQueryBuilder()
      .update(Order)
      .set({ status: OrderStatus.PendingPayment })
      .where('id = :orderId AND status = :status', {
        orderId,
        status: OrderStatus.PaymentFailed,
      })
      .execute();
  }

  // ── Admin ──────────────────────────────────────────────

  async adminList(
    query: AdminOrderQueryDto,
  ): Promise<Paginated<AdminOrderListItem>> {
    const qb = this.orders
      .createQueryBuilder('o')
      .addSelect(
        '(SELECT COALESCE(SUM(oi.quantity), 0) FROM order_items oi WHERE oi.order_id = o.id)',
        'item_count',
      );
    if (query.status)
      qb.andWhere('o.status = :status', { status: query.status });
    if (query.search) {
      qb.andWhere(
        '(o.orderNumber ILIKE :search OR o.contactEmail ILIKE :search)',
        { search: `%${escapeLike(query.search)}%` },
      );
    }
    if (query.from) qb.andWhere('o.createdAt >= :from', { from: query.from });
    if (query.to) qb.andWhere('o.createdAt <= :to', { to: query.to });

    const total = await qb.getCount();
    const { entities, raw } = await qb
      .orderBy('o.createdAt', 'DESC')
      .addOrderBy('o.id', 'ASC')
      .offset(offsetOf(query))
      .limit(query.limit)
      .getRawAndEntities();
    const counts = new Map(
      raw.map((row: { o_id: string; item_count: string }) => [
        row.o_id,
        Number(row.item_count),
      ]),
    );
    const paymentStatuses = await this.latestPaymentStatuses(
      entities.map((order) => order.id),
    );

    return paginate(
      entities.map((order) => ({
        id: order.id,
        orderNumber: order.orderNumber,
        status: order.status,
        paymentStatus: paymentStatuses.get(order.id) ?? null,
        customerName: `${order.shippingAddress.firstName} ${order.shippingAddress.lastName}`,
        contactEmail: order.contactEmail,
        itemCount: counts.get(order.id) ?? 0,
        total: toRupees(order.total),
        tracking: toOrderTracking(order),
        createdAt: order.createdAt,
      })),
      total,
      query,
    );
  }

  async adminGet(id: string): Promise<AdminOrderDetail> {
    const order = await this.orders.findOneBy({ id });
    if (!order) throw new NotFoundException('Order not found');
    const [view, customer] = await Promise.all([
      this.detail(order),
      order.userId
        ? this.users.findOne({
            where: { id: order.userId },
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
              phone: true,
            },
          })
        : null,
    ]);
    return {
      ...view,
      allowedTransitions: ADMIN_TRANSITIONS[order.status],
      customer: customer
        ? {
            id: customer.id,
            email: customer.email,
            firstName: customer.firstName,
            lastName: customer.lastName,
            phone: customer.phone,
          }
        : null,
    };
  }

  /**
   * Moves an order along the fulfilment lifecycle (see ADMIN_TRANSITIONS), optionally
   * updating tracking details, and records the change on the timeline. Shipping stamps
   * shipped_at and defaults the ETA by shipping method; delivery stamps delivered_at.
   */
  async adminUpdateStatus(
    id: string,
    dto: UpdateOrderStatusDto,
    adminId: string,
  ): Promise<AdminOrderDetail> {
    assertEtaNotPast(dto.estimatedDeliveryAt);
    const order = await this.orders.findOneBy({ id });
    if (!order) throw new NotFoundException('Order not found');
    const { status } = dto;
    if (!canAdminTransition(order.status, status)) {
      throw new ConflictException(
        `Cannot change order status from ${order.status} to ${status}`,
      );
    }
    const event: NewOrderEvent = {
      status,
      title: ADMIN_STATUS_TITLES[status] ?? status,
      note: dto.note ?? null,
      actor: OrderEventActor.Admin,
      actorUserId: adminId,
    };

    if (status === OrderStatus.Cancelled) {
      // NOTE: cancelling a paid order restocks items; the refund itself must be issued
      // through the payment provider (not automated while payments are mocked).
      await this.cancel(id, [order.status], event);
    } else {
      const changes: TrackingChanges &
        Partial<Pick<Order, 'status' | 'shippedAt' | 'deliveredAt'>> = {
        status,
        ...trackingChanges(dto),
      };
      if (status === OrderStatus.Shipped) {
        changes.shippedAt = new Date();
        if (changes.estimatedDeliveryAt == null && !order.estimatedDeliveryAt)
          changes.estimatedDeliveryAt = defaultEstimatedDelivery(
            order.shippingMethod,
          );
      }
      if (status === OrderStatus.Delivered) changes.deliveredAt = new Date();

      await this.dataSource.transaction(async (manager) => {
        const result = await manager
          .getRepository(Order)
          .update({ id, status: order.status }, changes);
        if (!result.affected)
          throw new ConflictException(
            'Order was modified concurrently; reload and try again',
          );
        await this.recordEvent(manager, id, event);
      });
    }

    const mail = STATUS_MAILS[status as keyof typeof STATUS_MAILS];
    if (mail && dto.notifyCustomer !== false)
      this.notifier.notify(id, mail, { note: dto.note });
    return this.adminGet(id);
  }

  /** Updates carrier / tracking number / link / ETA without changing the status. */
  async adminUpdateTracking(
    id: string,
    dto: UpdateOrderTrackingDto,
    adminId: string,
  ): Promise<AdminOrderDetail> {
    assertEtaNotPast(dto.estimatedDeliveryAt);
    const changes = trackingChanges(dto);
    if (!Object.keys(changes).length)
      throw new BadRequestException(
        'Provide at least one of carrier, trackingNumber, trackingUrl, estimatedDeliveryAt',
      );
    if (!(await this.orders.existsBy({ id })))
      throw new NotFoundException('Order not found');

    const title = 'Tracking updated';
    await this.dataSource.transaction(async (manager) => {
      await manager.getRepository(Order).update({ id }, changes);
      await this.recordEvent(manager, id, {
        status: null,
        title,
        note: dto.note ?? null,
        actor: OrderEventActor.Admin,
        actorUserId: adminId,
      });
    });
    if (dto.notifyCustomer)
      this.notifier.notify(id, 'update', { title, note: dto.note });
    return this.adminGet(id);
  }

  /** Adds a free-form update (e.g. "Reached the Chennai hub") to the timeline. */
  async adminAddEvent(
    id: string,
    dto: CreateOrderEventDto,
    adminId: string,
  ): Promise<AdminOrderDetail> {
    if (!(await this.orders.existsBy({ id })))
      throw new NotFoundException('Order not found');
    const title = dto.title ?? 'Shipment update';
    await this.recordEvent(this.dataSource.manager, id, {
      status: null,
      title,
      note: dto.note,
      actor: OrderEventActor.Admin,
      actorUserId: adminId,
    });
    if (dto.notifyCustomer)
      this.notifier.notify(id, 'update', { title, note: dto.note });
    return this.adminGet(id);
  }

  // ── Internals ──────────────────────────────────────────

  private async cancel(
    orderId: string,
    allowedFrom: OrderStatus[],
    event: NewOrderEvent,
  ): Promise<OrderView> {
    await this.dataSource.transaction(async (manager) => {
      const order = await manager
        .getRepository(Order)
        .createQueryBuilder('o')
        .setLock('pessimistic_write')
        .where('o.id = :orderId', { orderId })
        .getOne();
      if (!order || !allowedFrom.includes(order.status))
        throw new ConflictException(
          'Order status changed; reload and try again',
        );

      const pending = await manager
        .getRepository(Payment)
        .existsBy({ orderId, status: PaymentStatus.Pending });
      if (pending)
        throw new ConflictException(
          'A payment for this order is still being processed',
        );

      const items = await manager.getRepository(OrderItem).findBy({ orderId });
      for (const item of items) {
        if (!item.variantId) continue;
        await manager
          .createQueryBuilder()
          .update(ProductVariant)
          .set({ stock: () => 'stock + :quantity' })
          .where('id = :id')
          .setParameters({ id: item.variantId, quantity: item.quantity })
          .execute();
      }
      if (order.couponId) await this.coupons.release(manager, order.couponId);
      await manager
        .getRepository(Order)
        .update(
          { id: orderId },
          { status: OrderStatus.Cancelled, cancelledAt: new Date() },
        );
      await this.recordEvent(manager, orderId, event);
    });
    return this.view(await this.orders.findOneByOrFail({ id: orderId }));
  }

  private async resolveAddress(
    userId: string,
    addressId?: string,
    inline?: AddressFieldsDto,
  ): Promise<OrderAddress | null> {
    if (addressId && inline)
      throw new BadRequestException(
        'Provide either an address id or an inline address, not both',
      );
    if (addressId)
      return toSnapshot(await this.addresses.getOwned(userId, addressId));
    return inline ? toSnapshot(inline) : null;
  }

  private async recordEvent(
    manager: EntityManager,
    orderId: string,
    event: NewOrderEvent,
  ): Promise<void> {
    await manager.getRepository(OrderEvent).insert({
      orderId,
      status: event.status,
      title: event.title,
      note: event.note ?? null,
      actor: event.actor,
      actorUserId: event.actorUserId ?? null,
    });
  }

  /** Detail view: the order plus its timeline (oldest first). */
  private async detail(order: Order): Promise<OrderView> {
    const [view, events] = await Promise.all([
      this.view(order),
      this.events.find({
        where: { orderId: order.id },
        order: { createdAt: 'ASC' },
      }),
    ]);
    return { ...view, timeline: events.map(toOrderEventView) };
  }

  private async view(order: Order): Promise<OrderView> {
    return (await this.views([order]))[0];
  }

  private async views(orders: Order[]): Promise<OrderView[]> {
    if (!orders.length) return [];
    const ids = orders.map((order) => order.id);
    const [items, paymentStatuses] = await Promise.all([
      this.orderItems.find({
        where: { orderId: In(ids) },
        order: { productName: 'ASC' },
      }),
      this.latestPaymentStatuses(ids),
    ]);
    return orders.map((order) =>
      toOrderView(
        order,
        items.filter((item) => item.orderId === order.id),
        paymentStatuses.get(order.id) ?? null,
      ),
    );
  }

  private async latestPaymentStatuses(
    orderIds: string[],
  ): Promise<Map<string, PaymentStatus>> {
    if (!orderIds.length) return new Map();
    const payments = await this.payments
      .createQueryBuilder('pay')
      .distinctOn(['pay.orderId'])
      .where('pay.orderId IN (:...orderIds)', { orderIds })
      .orderBy('pay.orderId')
      .addOrderBy('pay.createdAt', 'DESC')
      .getMany();
    return new Map(
      payments.map((payment) => [payment.orderId, payment.status]),
    );
  }
}
