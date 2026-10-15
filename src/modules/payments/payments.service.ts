import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { toRupees } from '../../common/utils/money.js';
import { OrdersService } from '../orders/orders.service.js';
import { PAYABLE_STATUSES } from '../orders/order-status.js';
import { Payment, PaymentStatus } from './payment.entity.js';
import {
  PAYMENT_PROVIDER,
  type PaymentProvider,
  type ProviderPaymentStatus,
} from './providers/payment-provider.interface.js';

export interface PaymentView {
  id: string;
  orderNumber: string;
  provider: string;
  providerOrderId: string;
  status: PaymentStatus;
  amount: number;
  currency: string;
  failureReason: string | null;
}

export interface InitiatePaymentResult extends PaymentView {
  checkout: Record<string, unknown>;
}

const FINAL_STATUSES = [PaymentStatus.Succeeded, PaymentStatus.Failed];

const STATUS_MAP: Record<ProviderPaymentStatus, PaymentStatus> = {
  succeeded: PaymentStatus.Succeeded,
  failed: PaymentStatus.Failed,
  pending: PaymentStatus.Pending,
};

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    @InjectRepository(Payment) private readonly payments: Repository<Payment>,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
    private readonly orders: OrdersService,
    private readonly dataSource: DataSource,
  ) {}

  /** Creates a gateway order for an unpaid order (each call is a new payment attempt). */
  async initiate(
    userId: string,
    orderNumber: string,
  ): Promise<InitiatePaymentResult> {
    const order = await this.orders.findOwned(userId, orderNumber);
    if (!PAYABLE_STATUSES.includes(order.status))
      throw new ConflictException(
        `Order is ${order.status} and cannot be paid`,
      );

    if (
      await this.payments.existsBy({
        orderId: order.id,
        status: PaymentStatus.Pending,
      })
    ) {
      throw new ConflictException(
        'A payment for this order is already being processed',
      );
    }

    const gatewayOrder = await this.provider.createPaymentOrder({
      amount: order.total,
      currency: order.currency,
      receipt: order.orderNumber,
      notes: { orderId: order.id },
    });

    const payment = await this.dataSource.transaction(async (manager) => {
      // Earlier unpaid attempts stay "created": if the customer completes one of them
      // after all, its webhook still marks the order paid.
      await this.orders.reopenForPayment(manager, order.id);
      return manager.getRepository(Payment).save(
        manager.getRepository(Payment).create({
          orderId: order.id,
          provider: this.provider.name,
          providerOrderId: gatewayOrder.providerOrderId,
          amount: order.total,
          currency: order.currency,
          status: PaymentStatus.Created,
        }),
      );
    });

    return {
      ...this.toView(payment, order.orderNumber),
      checkout: gatewayOrder.checkout,
    };
  }

  /** Called by the storefront with what the gateway widget returned. */
  async confirm(
    userId: string,
    paymentId: string,
    input: { providerPaymentId: string; signature: string },
  ): Promise<PaymentView> {
    const payment = await this.getOwned(userId, paymentId);
    if (
      payment.status === PaymentStatus.Succeeded &&
      payment.providerPaymentId === input.providerPaymentId
    ) {
      return this.toView(payment, payment.order!.orderNumber); // idempotent retry
    }
    if (payment.status !== PaymentStatus.Created) {
      throw new ConflictException(`Payment is already ${payment.status}`);
    }

    const result = await this.provider.verifyPayment({
      providerOrderId: payment.providerOrderId,
      providerPaymentId: input.providerPaymentId,
      signature: input.signature,
    });
    if (!result.valid)
      throw new BadRequestException('Payment signature verification failed');

    await this.applyOutcome(
      payment.id,
      STATUS_MAP[result.status],
      input.providerPaymentId,
      result.failureReason,
    );
    return this.getView(userId, payment.id);
  }

  /** Gateway → server notification. Authenticated by HMAC signature, not by JWT. */
  async handleWebhook(
    rawBody: Buffer | undefined,
    signature: string | undefined,
  ): Promise<{ received: true }> {
    if (
      !rawBody ||
      !signature ||
      !this.provider.verifyWebhookSignature(rawBody, signature)
    ) {
      throw new UnauthorizedException('Invalid webhook signature');
    }
    let payload: unknown;
    try {
      payload = JSON.parse(rawBody.toString('utf8'));
    } catch {
      throw new BadRequestException('Malformed webhook payload');
    }
    const event = this.provider.parseWebhookEvent(payload);
    if (!event) return { received: true };

    const payment = await this.payments.findOneBy({
      providerOrderId: event.providerOrderId,
    });
    if (!payment) {
      this.logger.warn(
        `Webhook for unknown provider order ${event.providerOrderId}`,
      );
      return { received: true };
    }
    await this.applyOutcome(
      payment.id,
      STATUS_MAP[event.status],
      event.providerPaymentId,
      event.failureReason,
    );
    return { received: true };
  }

  async getView(userId: string, paymentId: string): Promise<PaymentView> {
    const payment = await this.getOwned(userId, paymentId);
    return this.toView(payment, payment.order!.orderNumber);
  }

  /** Mock-only helper exposed for the simulated checkout widget. */
  async getOwnedProviderOrderId(
    userId: string,
    paymentId: string,
  ): Promise<string> {
    const payment = await this.getOwned(userId, paymentId);
    if (payment.status !== PaymentStatus.Created)
      throw new ConflictException(`Payment is already ${payment.status}`);
    return payment.providerOrderId;
  }

  /**
   * Applies a gateway outcome exactly once. The payment row is locked so a confirm call
   * and a webhook arriving together cannot both transition it; final states never change.
   */
  private async applyOutcome(
    paymentId: string,
    status: PaymentStatus,
    providerPaymentId: string,
    failureReason?: string,
  ) {
    const paidOrderId = await this.dataSource.transaction(async (manager) => {
      const payment = await manager
        .getRepository(Payment)
        .createQueryBuilder('pay')
        .setLock('pessimistic_write')
        .where('pay.id = :paymentId', { paymentId })
        .getOneOrFail();
      if (FINAL_STATUSES.includes(payment.status)) return null;
      if (
        payment.status === PaymentStatus.Pending &&
        status === PaymentStatus.Pending
      )
        return null;

      await manager.getRepository(Payment).update(
        { id: payment.id },
        {
          status,
          providerPaymentId,
          failureReason:
            status === PaymentStatus.Failed
              ? (failureReason ?? 'Payment failed')
              : null,
        },
      );
      if (status === PaymentStatus.Failed)
        await this.orders.markPaymentFailed(manager, payment.orderId);
      if (
        status === PaymentStatus.Succeeded &&
        (await this.orders.markPaid(manager, payment.orderId))
      )
        return payment.orderId;
      return null;
    });
    // Emailed only after commit, so the confirmation never precedes the paid state.
    if (paidOrderId) this.orders.notifyPaid(paidOrderId);
  }

  private async getOwned(userId: string, paymentId: string): Promise<Payment> {
    const payment = await this.payments
      .createQueryBuilder('pay')
      .innerJoinAndSelect('pay.order', 'o', 'o.userId = :userId', { userId })
      .where('pay.id = :paymentId', { paymentId })
      .getOne();
    if (!payment) throw new NotFoundException('Payment not found');
    return payment;
  }

  private toView(payment: Payment, orderNumber: string): PaymentView {
    return {
      id: payment.id,
      orderNumber,
      provider: payment.provider,
      providerOrderId: payment.providerOrderId,
      status: payment.status,
      amount: toRupees(payment.amount),
      currency: payment.currency,
      failureReason: payment.failureReason,
    };
  }
}
