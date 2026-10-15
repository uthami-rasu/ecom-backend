import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { toRupees } from '../../common/utils/money.js';
import { MailService, type MailMessage } from '../mail/mail.service.js';
import { orderMail, type OrderMailKind } from '../mail/mail.templates.js';
import { OrderItem } from './entities/order-item.entity.js';
import { Order } from './entities/order.entity.js';

/**
 * Customer emails about an order (sent to its contact email). Fire-and-forget: they are
 * rendered from the committed order and a failure is logged, never surfaced to the
 * request that triggered it.
 */
@Injectable()
export class OrderNotifier {
  constructor(
    @InjectRepository(Order) private readonly orders: Repository<Order>,
    @InjectRepository(OrderItem)
    private readonly items: Repository<OrderItem>,
    private readonly mail: MailService,
  ) {}

  notify(
    orderId: string,
    kind: OrderMailKind,
    event: { title?: string; note?: string | null } = {},
  ): void {
    this.mail.sendInBackground(this.render(orderId, kind, event));
  }

  private async render(
    orderId: string,
    kind: OrderMailKind,
    event: { title?: string; note?: string | null },
  ): Promise<MailMessage | null> {
    const order = await this.orders.findOneBy({ id: orderId });
    if (!order) return null;
    const items =
      kind === 'paid'
        ? await this.items.find({
            where: { orderId },
            order: { productName: 'ASC' },
          })
        : [];
    return {
      to: order.contactEmail,
      ...orderMail({
        kind,
        orderNumber: order.orderNumber,
        firstName: order.shippingAddress.firstName,
        currency: order.currency,
        total: toRupees(order.total),
        items: items.map((item) => ({
          name: item.productName,
          variant: item.variantLabel,
          quantity: item.quantity,
          lineTotal: toRupees(item.lineTotal),
        })),
        carrier: order.carrier,
        trackingNumber: order.trackingNumber,
        trackingUrl: order.trackingUrl,
        estimatedDeliveryAt: order.estimatedDeliveryAt,
        title: event.title ?? null,
        note: event.note ?? null,
        orderUrl: `${this.mail.storefrontUrl}/#orders/${encodeURIComponent(order.orderNumber)}`,
      }),
    };
  }
}
