/**
 * Contract every payment gateway adapter implements. The flow intentionally mirrors
 * Razorpay so a RazorpayPaymentProvider can replace MockPaymentProvider without any
 * change to PaymentsService, controllers or the storefront contract:
 *
 *  1. createPaymentOrder   → gateway order (Razorpay: orders.create)
 *  2. client pays          → gateway returns paymentId + signature to the browser
 *  3. verifyPayment        → server verifies the signature and reads the outcome
 *  4. webhook              → asynchronous final status for "pending" payments
 */
export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER');

export type ProviderPaymentStatus = 'succeeded' | 'failed' | 'pending';

export interface CreatePaymentOrderInput {
  /** Paise. */
  amount: number;
  currency: string;
  /** Our order number; shown in the gateway dashboard. */
  receipt: string;
  notes?: Record<string, string>;
}

export interface CreatePaymentOrderResult {
  providerOrderId: string;
  /** Data the frontend passes to the gateway's checkout widget. Never contains secrets. */
  checkout: Record<string, unknown>;
}

export interface VerifyPaymentInput {
  providerOrderId: string;
  providerPaymentId: string;
  signature: string;
}

export type VerifyPaymentResult =
  | { valid: false }
  | { valid: true; status: ProviderPaymentStatus; failureReason?: string };

export interface WebhookEvent {
  providerOrderId: string;
  providerPaymentId: string;
  status: Exclude<ProviderPaymentStatus, 'pending'>;
  failureReason?: string;
}

export interface PaymentProvider {
  readonly name: string;
  createPaymentOrder(
    input: CreatePaymentOrderInput,
  ): Promise<CreatePaymentOrderResult>;
  verifyPayment(input: VerifyPaymentInput): Promise<VerifyPaymentResult>;
  verifyWebhookSignature(rawBody: Buffer, signature: string): boolean;
  /** Returns null for events that do not affect payment status. */
  parseWebhookEvent(payload: unknown): WebhookEvent | null;
}
