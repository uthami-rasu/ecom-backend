import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';
import type { AppConfig } from '../../../config/configuration.js';
import { hmacSha256, safeEqualHex } from './hmac.js';
import type {
  CreatePaymentOrderInput,
  CreatePaymentOrderResult,
  PaymentProvider,
  ProviderPaymentStatus,
  VerifyPaymentInput,
  VerifyPaymentResult,
  WebhookEvent,
} from './payment-provider.interface.js';

export const MOCK_OUTCOMES = ['success', 'failure', 'pending'] as const;
export type MockOutcome = (typeof MOCK_OUTCOMES)[number];

const OUTCOME_STATUS: Record<MockOutcome, ProviderPaymentStatus> = {
  success: 'succeeded',
  failure: 'failed',
  pending: 'pending',
};

const randomId = () =>
  randomBytes(9).toString('base64url').replace(/[-_]/g, 'x');

/**
 * In-process stand-in for Razorpay. Signatures use the same scheme as Razorpay
 * (HMAC-SHA256 of "orderId|paymentId" with the key secret), so the verification
 * path through PaymentsService is exercised for real. The outcome a tester wants is
 * encoded in the payment id produced by `simulateCheckout` (the "widget").
 */
@Injectable()
export class MockPaymentProvider implements PaymentProvider {
  readonly name = 'mock';
  private readonly keySecret: string;
  private readonly webhookSecret: string;

  constructor(config: ConfigService<AppConfig, true>) {
    const payments = config.get('payments', { infer: true });
    this.keySecret = payments.keySecret;
    this.webhookSecret = payments.webhookSecret;
  }

  async createPaymentOrder(
    input: CreatePaymentOrderInput,
  ): Promise<CreatePaymentOrderResult> {
    const providerOrderId = `mock_order_${randomId()}`;
    return {
      providerOrderId,
      checkout: {
        provider: this.name,
        keyId: 'mock_key_id',
        providerOrderId,
        amount: input.amount,
        currency: input.currency,
        receipt: input.receipt,
        outcomes: MOCK_OUTCOMES,
      },
    };
  }

  /** What the gateway widget would hand back to the browser after the customer pays. */
  simulateCheckout(providerOrderId: string, outcome: MockOutcome) {
    const providerPaymentId = `mock_pay_${outcome}_${randomId()}`;
    return {
      providerOrderId,
      providerPaymentId,
      signature: this.sign(providerOrderId, providerPaymentId),
    };
  }

  async verifyPayment(input: VerifyPaymentInput): Promise<VerifyPaymentResult> {
    if (
      !safeEqualHex(
        this.sign(input.providerOrderId, input.providerPaymentId),
        input.signature,
      )
    )
      return { valid: false };
    const outcome = input.providerPaymentId.match(
      /^mock_pay_(success|failure|pending)_/,
    )?.[1] as MockOutcome | undefined;
    if (!outcome) return { valid: false };
    return {
      valid: true,
      status: OUTCOME_STATUS[outcome],
      ...(outcome === 'failure' && {
        failureReason: 'Card declined by issuing bank (mock)',
      }),
    };
  }

  verifyWebhookSignature(rawBody: Buffer, signature: string): boolean {
    return safeEqualHex(hmacSha256(this.webhookSecret, rawBody), signature);
  }

  /** Accepts Razorpay-shaped events: payment.captured / payment.failed. */
  parseWebhookEvent(payload: unknown): WebhookEvent | null {
    const event = payload as {
      event?: string;
      payload?: {
        payment?: {
          entity?: {
            id?: string;
            order_id?: string;
            error_description?: string;
          };
        };
      };
    };
    const entity = event?.payload?.payment?.entity;
    if (!entity?.id || !entity.order_id) return null;
    if (event.event === 'payment.captured') {
      return {
        providerOrderId: entity.order_id,
        providerPaymentId: entity.id,
        status: 'succeeded',
      };
    }
    if (event.event === 'payment.failed') {
      return {
        providerOrderId: entity.order_id,
        providerPaymentId: entity.id,
        status: 'failed',
        failureReason: entity.error_description ?? 'Payment failed',
      };
    }
    return null;
  }

  private sign(providerOrderId: string, providerPaymentId: string): string {
    return hmacSha256(
      this.keySecret,
      `${providerOrderId}|${providerPaymentId}`,
    );
  }
}
