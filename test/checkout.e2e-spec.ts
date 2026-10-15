import type { NestExpressApplication } from '@nestjs/platform-express';
import { createHmac } from 'node:crypto';
import request from 'supertest';
import {
  API,
  bearer,
  createTestApp,
  loginAdmin,
  registerUser,
  shippingAddress,
  variantOf,
  type TestUser,
} from './utils/app.js';

describe('Checkout and mock payments (e2e)', () => {
  let app: NestExpressApplication;
  let http: () => ReturnType<typeof request>;

  beforeAll(async () => {
    app = await createTestApp();
    http = () => request(app.getHttpServer());
  });
  afterAll(() => app.close());

  async function placeOrder(
    user: TestUser,
    slug = 'premium-dried-amla',
    label = '250g',
    quantity = 1,
    extra: object = {},
  ) {
    const { variant } = await variantOf(app, slug, label);
    await http()
      .post(`${API}/cart/items`)
      .set(bearer(user.accessToken))
      .send({ variantId: variant.id, quantity })
      .expect(201);
    const res = await http()
      .post(`${API}/orders`)
      .set(bearer(user.accessToken))
      .send({ shippingAddress, shippingMethod: 'standard', ...extra })
      .expect(201);
    return { order: res.body, variant };
  }

  async function pay(
    user: TestUser,
    orderNumber: string,
    outcome: 'success' | 'failure' | 'pending',
  ) {
    const initiated = await http()
      .post(`${API}/payments/orders/${orderNumber}`)
      .set(bearer(user.accessToken))
      .expect(201);
    const widget = await http()
      .post(`${API}/payments/${initiated.body.id}/mock-checkout`)
      .set(bearer(user.accessToken))
      .send({ outcome })
      .expect(200);
    const confirmed = await http()
      .post(`${API}/payments/${initiated.body.id}/confirm`)
      .set(bearer(user.accessToken))
      .send({
        providerPaymentId: widget.body.providerPaymentId,
        signature: widget.body.signature,
      })
      .expect(200);
    return {
      initiated: initiated.body,
      widget: widget.body,
      confirmed: confirmed.body,
    };
  }

  async function stockOf(
    adminToken: string,
    productId: string,
    variantId: string,
  ): Promise<number> {
    const res = await http()
      .get(`${API}/admin/products/${productId}`)
      .set(bearer(adminToken))
      .expect(200);
    return res.body.variants.find((v: { id: string }) => v.id === variantId)
      .stock;
  }

  it('rejects checkout of an empty cart and missing address', async () => {
    const user = await registerUser(app, 'empty');
    await http()
      .post(`${API}/orders`)
      .set(bearer(user.accessToken))
      .send({ shippingAddress })
      .expect(400);
    await http()
      .post(`${API}/orders`)
      .set(bearer(user.accessToken))
      .send({})
      .expect(400);
  });

  it('places an order: snapshots items, reserves stock, clears the cart', async () => {
    const user = await registerUser(app, 'checkout');
    const admin = await loginAdmin(app);
    const { product, variant } = await variantOf(
      app,
      'premium-dried-amla',
      '250g',
    );
    const stockBefore = await stockOf(admin, product.id, variant.id);

    const { order } = await placeOrder(user, 'premium-dried-amla', '250g', 2);
    expect(order).toMatchObject({
      status: 'pending_payment',
      paymentStatus: null,
      itemCount: 2,
      contactEmail: user.email,
      shippingAddress: { city: 'Kovilpatti', country: 'IN' },
      billingAddress: { city: 'Kovilpatti' },
    });
    expect(order.orderNumber).toMatch(/^BSC-[0-9A-Z]{8}$/);
    expect(order.items[0]).toMatchObject({
      productSlug: 'premium-dried-amla',
      variantLabel: '250g',
      quantity: 2,
    });
    expect(order.total).toBe(
      order.subtotal - order.discount + order.shippingFee,
    );

    expect(await stockOf(admin, product.id, variant.id)).toBe(stockBefore - 2);
    expect(
      (await http().get(`${API}/cart`).set(bearer(user.accessToken))).body
        .items,
    ).toHaveLength(0);

    const history = await http()
      .get(`${API}/orders`)
      .set(bearer(user.accessToken))
      .expect(200);
    expect(
      history.body.data.map((o: { orderNumber: string }) => o.orderNumber),
    ).toContain(order.orderNumber);
  });

  it('uses a saved address and applies the cart coupon to the order', async () => {
    const user = await registerUser(app, 'coupon');
    const address = await http()
      .post(`${API}/users/me/addresses`)
      .set(bearer(user.accessToken))
      .send(shippingAddress)
      .expect(201);
    const { variant } = await variantOf(app, 'honey-tasting-trio'); // ₹1490
    await http()
      .post(`${API}/cart/items`)
      .set(bearer(user.accessToken))
      .send({ variantId: variant.id, quantity: 1 })
      .expect(201);
    await http()
      .post(`${API}/cart/coupon`)
      .set(bearer(user.accessToken))
      .send({ code: 'JENKATEMW' })
      .expect(200);

    const res = await http()
      .post(`${API}/orders`)
      .set(bearer(user.accessToken))
      .send({ shippingAddressId: address.body.id, shippingMethod: 'express' })
      .expect(201);
    expect(res.body).toMatchObject({
      subtotal: 1490,
      discount: 25,
      shippingFee: 150,
      total: 1615,
      couponCode: 'JENKATEMW',
    });
  });

  it('mock payment SUCCESS marks the order paid', async () => {
    const user = await registerUser(app, 'paysuccess');
    const { order } = await placeOrder(user);
    const { initiated, confirmed } = await pay(
      user,
      order.orderNumber,
      'success',
    );

    expect(initiated).toMatchObject({
      status: 'created',
      amount: order.total,
      currency: 'INR',
      provider: 'mock',
    });
    expect(initiated.checkout).toMatchObject({
      provider: 'mock',
      providerOrderId: initiated.providerOrderId,
    });
    expect(confirmed).toMatchObject({
      status: 'succeeded',
      failureReason: null,
    });

    const after = await http()
      .get(`${API}/orders/${order.orderNumber}`)
      .set(bearer(user.accessToken))
      .expect(200);
    expect(after.body).toMatchObject({
      status: 'paid',
      paymentStatus: 'succeeded',
    });
    expect(after.body.paidAt).not.toBeNull();

    // Paid orders cannot be paid again or cancelled by the customer.
    await http()
      .post(`${API}/payments/orders/${order.orderNumber}`)
      .set(bearer(user.accessToken))
      .expect(409);
    await http()
      .post(`${API}/orders/${order.orderNumber}/cancel`)
      .set(bearer(user.accessToken))
      .expect(409);
  });

  it('confirm is idempotent for the same successful payment', async () => {
    const user = await registerUser(app, 'idempotent');
    const { order } = await placeOrder(user);
    const { initiated, widget } = await pay(user, order.orderNumber, 'success');
    const again = await http()
      .post(`${API}/payments/${initiated.id}/confirm`)
      .set(bearer(user.accessToken))
      .send({
        providerPaymentId: widget.providerPaymentId,
        signature: widget.signature,
      })
      .expect(200);
    expect(again.body.status).toBe('succeeded');
  });

  it('mock payment FAILURE marks payment_failed and allows a retry that succeeds', async () => {
    const user = await registerUser(app, 'payfail');
    const { order } = await placeOrder(user);
    const failed = await pay(user, order.orderNumber, 'failure');
    expect(failed.confirmed).toMatchObject({
      status: 'failed',
      failureReason: expect.stringContaining('declined'),
    });
    expect(
      (
        await http()
          .get(`${API}/orders/${order.orderNumber}`)
          .set(bearer(user.accessToken))
      ).body.status,
    ).toBe('payment_failed');

    await pay(user, order.orderNumber, 'success');
    expect(
      (
        await http()
          .get(`${API}/orders/${order.orderNumber}`)
          .set(bearer(user.accessToken))
      ).body.status,
    ).toBe('paid');
  });

  it('mock payment PENDING is resolved by a signed webhook', async () => {
    const user = await registerUser(app, 'paypending');
    const { order } = await placeOrder(user);
    const { initiated, widget, confirmed } = await pay(
      user,
      order.orderNumber,
      'pending',
    );
    expect(confirmed.status).toBe('pending');
    expect(
      (
        await http()
          .get(`${API}/orders/${order.orderNumber}`)
          .set(bearer(user.accessToken))
      ).body,
    ).toMatchObject({
      status: 'pending_payment',
      paymentStatus: 'pending',
    });

    // Neither a new attempt nor cancellation is allowed while the gateway is still deciding.
    await http()
      .post(`${API}/payments/orders/${order.orderNumber}`)
      .set(bearer(user.accessToken))
      .expect(409);
    await http()
      .post(`${API}/orders/${order.orderNumber}/cancel`)
      .set(bearer(user.accessToken))
      .expect(409);

    const body = JSON.stringify({
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: widget.providerPaymentId,
            order_id: initiated.providerOrderId,
          },
        },
      },
    });
    const signature = createHmac('sha256', process.env.PAYMENT_WEBHOOK_SECRET!)
      .update(body)
      .digest('hex');

    await http()
      .post(`${API}/payments/webhook`)
      .set('Content-Type', 'application/json')
      .set('x-payment-signature', 'deadbeef')
      .send(body)
      .expect(401);
    await http()
      .post(`${API}/payments/webhook`)
      .set('Content-Type', 'application/json')
      .set('x-payment-signature', signature)
      .send(body)
      .expect(200);
    // Redelivery is harmless.
    await http()
      .post(`${API}/payments/webhook`)
      .set('Content-Type', 'application/json')
      .set('x-payment-signature', signature)
      .send(body)
      .expect(200);

    const after = await http()
      .get(`${API}/orders/${order.orderNumber}`)
      .set(bearer(user.accessToken))
      .expect(200);
    expect(after.body).toMatchObject({
      status: 'paid',
      paymentStatus: 'succeeded',
    });
  });

  it('a payment.failed webhook resolves a pending payment as failed', async () => {
    const user = await registerUser(app, 'webhookfail');
    const { order } = await placeOrder(user);
    const { initiated, widget } = await pay(user, order.orderNumber, 'pending');
    const body = JSON.stringify({
      event: 'payment.failed',
      payload: {
        payment: {
          entity: {
            id: widget.providerPaymentId,
            order_id: initiated.providerOrderId,
            error_description: 'UPI timeout',
          },
        },
      },
    });
    const signature = createHmac('sha256', process.env.PAYMENT_WEBHOOK_SECRET!)
      .update(body)
      .digest('hex');
    await http()
      .post(`${API}/payments/webhook`)
      .set('Content-Type', 'application/json')
      .set('x-payment-signature', signature)
      .send(body)
      .expect(200);

    const payment = await http()
      .get(`${API}/payments/${initiated.id}`)
      .set(bearer(user.accessToken))
      .expect(200);
    expect(payment.body).toMatchObject({
      status: 'failed',
      failureReason: 'UPI timeout',
    });
  });

  it('rejects forged payment signatures without changing state', async () => {
    const user = await registerUser(app, 'forged');
    const { order } = await placeOrder(user);
    const initiated = await http()
      .post(`${API}/payments/orders/${order.orderNumber}`)
      .set(bearer(user.accessToken))
      .expect(201);
    await http()
      .post(`${API}/payments/${initiated.body.id}/confirm`)
      .set(bearer(user.accessToken))
      .send({
        providerPaymentId: 'mock_pay_success_forged123',
        signature: 'a'.repeat(64),
      })
      .expect(400);
    const payment = await http()
      .get(`${API}/payments/${initiated.body.id}`)
      .set(bearer(user.accessToken))
      .expect(200);
    expect(payment.body.status).toBe('created');
  });

  it('customer cancellation restocks items and releases the coupon', async () => {
    const user = await registerUser(app, 'cancel');
    const admin = await loginAdmin(app);
    const { product, variant } = await variantOf(
      app,
      'ruby-cranberries',
      '250g',
    );
    const stockBefore = await stockOf(admin, product.id, variant.id);

    const { order } = await placeOrder(user, 'ruby-cranberries', '250g', 3);
    expect(await stockOf(admin, product.id, variant.id)).toBe(stockBefore - 3);

    const cancelled = await http()
      .post(`${API}/orders/${order.orderNumber}/cancel`)
      .set(bearer(user.accessToken))
      .expect(200);
    expect(cancelled.body.status).toBe('cancelled');
    expect(await stockOf(admin, product.id, variant.id)).toBe(stockBefore);
    await http()
      .post(`${API}/payments/orders/${order.orderNumber}`)
      .set(bearer(user.accessToken))
      .expect(409);
  });

  it('prevents overselling when stock runs out between cart and checkout', async () => {
    const admin = await loginAdmin(app);
    const buyerA = await registerUser(app, 'buyerA');
    const buyerB = await registerUser(app, 'buyerB');
    const { product, variant } = await variantOf(
      app,
      'golden-kiwi-slices',
      '1kg',
    );
    await http()
      .patch(`${API}/admin/products/${product.id}/variants/${variant.id}`)
      .set(bearer(admin))
      .send({ stock: 1 })
      .expect(200);

    for (const buyer of [buyerA, buyerB]) {
      await http()
        .post(`${API}/cart/items`)
        .set(bearer(buyer.accessToken))
        .send({ variantId: variant.id, quantity: 1 })
        .expect(201);
    }
    const results = await Promise.all(
      [buyerA, buyerB].map((buyer) =>
        http()
          .post(`${API}/orders`)
          .set(bearer(buyer.accessToken))
          .send({ shippingAddress }),
      ),
    );
    expect(results.map((res) => res.status).sort((a, b) => a - b)).toEqual([
      201, 409,
    ]);
    expect(await stockOf(admin, product.id, variant.id)).toBe(0);
  });

  it('validates the order number format', async () => {
    const user = await registerUser(app, 'format');
    await http()
      .get(`${API}/orders/not-an-order`)
      .set(bearer(user.accessToken))
      .expect(400);
    await http()
      .get(`${API}/orders/BSC-ZZZZZZZZ`)
      .set(bearer(user.accessToken))
      .expect(404);
  });
});
