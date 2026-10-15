import { createHmac } from 'node:crypto';
import type { ConfigService } from '@nestjs/config';
import { MockPaymentProvider } from './mock-payment.provider.js';

const config = {
  get: () => ({ keySecret: 'key-secret', webhookSecret: 'webhook-secret' }),
} as unknown as ConfigService;

describe('MockPaymentProvider', () => {
  const provider = new MockPaymentProvider(config as never);

  it('creates gateway orders without leaking secrets', async () => {
    const order = await provider.createPaymentOrder({
      amount: 48_000,
      currency: 'INR',
      receipt: 'BSC-ABCDEFGH',
    });
    expect(order.providerOrderId).toMatch(/^mock_order_/);
    expect(JSON.stringify(order.checkout)).not.toContain('secret');
  });

  it.each([
    ['success', 'succeeded'],
    ['failure', 'failed'],
    ['pending', 'pending'],
  ] as const)('verifies a signed %s payment as %s', async (outcome, status) => {
    const widget = provider.simulateCheckout('mock_order_1', outcome);
    const result = await provider.verifyPayment(widget);
    expect(result).toMatchObject({ valid: true, status });
    if (outcome === 'failure') expect(result).toHaveProperty('failureReason');
  });

  it('uses the Razorpay signature scheme', () => {
    const widget = provider.simulateCheckout('mock_order_1', 'success');
    const expected = createHmac('sha256', 'key-secret')
      .update(`mock_order_1|${widget.providerPaymentId}`)
      .digest('hex');
    expect(widget.signature).toBe(expected);
  });

  it('rejects tampered signatures, swapped orders and foreign payment ids', async () => {
    const widget = provider.simulateCheckout('mock_order_1', 'success');
    expect(
      await provider.verifyPayment({ ...widget, signature: 'f'.repeat(64) }),
    ).toEqual({ valid: false });
    expect(
      await provider.verifyPayment({ ...widget, signature: 'not-hex' }),
    ).toEqual({ valid: false });
    expect(
      await provider.verifyPayment({
        ...widget,
        providerOrderId: 'mock_order_2',
      }),
    ).toEqual({ valid: false });

    const foreignId = 'pay_real_123';
    const signature = createHmac('sha256', 'key-secret')
      .update(`mock_order_1|${foreignId}`)
      .digest('hex');
    expect(
      await provider.verifyPayment({
        providerOrderId: 'mock_order_1',
        providerPaymentId: foreignId,
        signature,
      }),
    ).toEqual({ valid: false });
  });

  it('verifies webhook signatures over the raw body', () => {
    const body = Buffer.from('{"event":"payment.captured"}');
    const signature = createHmac('sha256', 'webhook-secret')
      .update(body)
      .digest('hex');
    expect(provider.verifyWebhookSignature(body, signature)).toBe(true);
    expect(
      provider.verifyWebhookSignature(
        Buffer.from('{"event":"payment.failed"}'),
        signature,
      ),
    ).toBe(false);
  });

  it('parses Razorpay-shaped webhook events', () => {
    const entity = {
      id: 'pay_1',
      order_id: 'order_1',
      error_description: 'Bank down',
    };
    expect(
      provider.parseWebhookEvent({
        event: 'payment.captured',
        payload: { payment: { entity } },
      }),
    ).toEqual({
      providerOrderId: 'order_1',
      providerPaymentId: 'pay_1',
      status: 'succeeded',
    });
    expect(
      provider.parseWebhookEvent({
        event: 'payment.failed',
        payload: { payment: { entity } },
      }),
    ).toMatchObject({
      status: 'failed',
      failureReason: 'Bank down',
    });
    expect(
      provider.parseWebhookEvent({
        event: 'refund.created',
        payload: { payment: { entity } },
      }),
    ).toBeNull();
    expect(provider.parseWebhookEvent({})).toBeNull();
  });
});
