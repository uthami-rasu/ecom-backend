import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import {
  API,
  bearer,
  createTestApp,
  loginAdmin,
  mailsTo,
  registerUser,
  shippingAddress,
  variantOf,
  type TestUser,
} from './utils/app.js';

const DAY_MS = 24 * 60 * 60 * 1000;

describe('Order lifecycle and tracking (e2e)', () => {
  let app: NestExpressApplication;
  let http: () => ReturnType<typeof request>;
  let admin: string;
  let customer: TestUser;

  beforeAll(async () => {
    app = await createTestApp();
    http = () => request(app.getHttpServer());
    admin = await loginAdmin(app);
    customer = await registerUser(app, 'tracking');
  });
  afterAll(() => app.close());

  async function placeOrder(shippingMethod: 'standard' | 'express') {
    const { variant } = await variantOf(app, 'premium-sweet-rings', '250g');
    await http()
      .post(`${API}/cart/items`)
      .set(bearer(customer.accessToken))
      .send({ variantId: variant.id, quantity: 1 })
      .expect(201);
    return (
      await http()
        .post(`${API}/orders`)
        .set(bearer(customer.accessToken))
        .send({ shippingAddress, shippingMethod })
        .expect(201)
    ).body;
  }

  async function payFor(orderNumber: string) {
    const initiated = await http()
      .post(`${API}/payments/orders/${orderNumber}`)
      .set(bearer(customer.accessToken))
      .expect(201);
    const widget = await http()
      .post(`${API}/payments/${initiated.body.id}/mock-checkout`)
      .set(bearer(customer.accessToken))
      .send({ outcome: 'success' })
      .expect(200);
    await http()
      .post(`${API}/payments/${initiated.body.id}/confirm`)
      .set(bearer(customer.accessToken))
      .send({
        providerPaymentId: widget.body.providerPaymentId,
        signature: widget.body.signature,
      })
      .expect(200);
  }

  const setStatus = (orderId: string, body: object, token = admin) =>
    http()
      .patch(`${API}/admin/orders/${orderId}/status`)
      .set(bearer(token))
      .send(body);

  const subjects = () => mailsTo(app, customer.email).map((m) => m.subject);
  const waitForMail = (subject: string) =>
    vi.waitFor(() => expect(subjects()).toContain(subject));

  it('moves a paid order through the whole lifecycle with tracking, timeline and emails', async () => {
    const order = await placeOrder('express');
    expect(order.tracking).toEqual({
      carrier: null,
      trackingNumber: null,
      trackingUrl: null,
      estimatedDeliveryAt: null,
      shippedAt: null,
      deliveredAt: null,
    });

    // Not paid yet: cannot be confirmed.
    await setStatus(order.id, { status: 'processing' }).expect(409);

    await payFor(order.orderNumber);
    await waitForMail(`Order confirmed #${order.orderNumber}`);
    const confirmation = mailsTo(app, customer.email).find(
      (m) => m.subject === `Order confirmed #${order.orderNumber}`,
    )!;
    expect(confirmation.text).toContain('Premium Sweet Rings');
    expect(confirmation.html).toContain(
      `http://localhost:5173/#orders/${order.orderNumber}`,
    );

    const processing = await setStatus(order.id, {
      status: 'processing',
    }).expect(200);
    expect(processing.body).toMatchObject({
      status: 'processing',
      allowedTransitions: ['packed', 'shipped', 'cancelled'],
    });
    expect(processing.body.timeline.at(-1)).toMatchObject({
      status: 'processing',
      title: 'Order confirmed',
      actor: 'admin',
    });

    const packed = await setStatus(order.id, {
      status: 'packed',
      note: 'Packed in eco-friendly box',
    }).expect(200);
    expect(packed.body.timeline.at(-1)).toMatchObject({
      status: 'packed',
      title: 'Packed and ready to ship',
      note: 'Packed in eco-friendly box',
    });

    // Invalid transitions keep the existing 409 behaviour.
    await setStatus(order.id, { status: 'delivered' }).expect(409);
    await setStatus(order.id, { status: 'processing' }).expect(409);
    await setStatus(order.id, { status: 'out_for_delivery' }).expect(409);
    await setStatus(order.id, { status: 'unknown' }).expect(400);

    // An ETA in the past is rejected and nothing changes.
    await setStatus(order.id, {
      status: 'shipped',
      estimatedDeliveryAt: new Date(Date.now() - 2 * DAY_MS).toISOString(),
    }).expect(400);
    await setStatus(order.id, {
      status: 'shipped',
      trackingUrl: 'javascript:alert(1)',
    }).expect(400);

    const before = Date.now();
    const shipped = await setStatus(order.id, {
      status: 'shipped',
      carrier: 'Delhivery',
      trackingNumber: 'DLV123456789IN',
      trackingUrl: 'https://track.example.com/DLV123456789IN',
    }).expect(200);
    expect(shipped.body.status).toBe('shipped');
    const tracking = shipped.body.tracking;
    expect(tracking).toMatchObject({
      carrier: 'Delhivery',
      trackingNumber: 'DLV123456789IN',
      trackingUrl: 'https://track.example.com/DLV123456789IN',
      deliveredAt: null,
    });
    const shippedAt = new Date(tracking.shippedAt).getTime();
    expect(shippedAt).toBeGreaterThanOrEqual(before - 1000);
    // Express shipping: default ETA is two days after shipping.
    expect(
      Math.abs(
        new Date(tracking.estimatedDeliveryAt).getTime() -
          (shippedAt + 2 * DAY_MS),
      ),
    ).toBeLessThan(5000);
    expect(shipped.body.allowedTransitions).toEqual([
      'out_for_delivery',
      'delivered',
    ]);
    await setStatus(order.id, { status: 'cancelled' }).expect(409);

    await waitForMail(`Your order #${order.orderNumber} has shipped`);
    const shippedMail = mailsTo(app, customer.email).find(
      (m) => m.subject === `Your order #${order.orderNumber} has shipped`,
    )!;
    expect(shippedMail.text).toContain('Carrier: Delhivery');
    expect(shippedMail.text).toContain('DLV123456789IN');
    expect(shippedMail.text).toContain('Estimated delivery');
    expect(shippedMail.html).toContain(
      'https://track.example.com/DLV123456789IN',
    );

    // Tracking update without a status change.
    const eta = new Date(Date.now() + 4 * DAY_MS).toISOString();
    await http()
      .patch(`${API}/admin/orders/${order.id}/tracking`)
      .set(bearer(admin))
      .send({})
      .expect(400);
    await http()
      .patch(`${API}/admin/orders/${order.id}/tracking`)
      .set(bearer(admin))
      .send({ estimatedDeliveryAt: new Date(Date.now() - 2 * DAY_MS) })
      .expect(400);
    const mailCount = mailsTo(app, customer.email).length;
    const updated = await http()
      .patch(`${API}/admin/orders/${order.id}/tracking`)
      .set(bearer(admin))
      .send({
        trackingNumber: 'DLV987654321IN',
        estimatedDeliveryAt: eta,
        note: 'Rerouted via Chennai hub',
      })
      .expect(200);
    expect(updated.body.status).toBe('shipped');
    expect(updated.body.tracking).toMatchObject({
      carrier: 'Delhivery',
      trackingNumber: 'DLV987654321IN',
      estimatedDeliveryAt: eta,
    });
    expect(updated.body.timeline.at(-1)).toMatchObject({
      status: null,
      title: 'Tracking updated',
      note: 'Rerouted via Chennai hub',
      actor: 'admin',
    });

    // Custom timeline event, emailed on request.
    await http()
      .post(`${API}/admin/orders/${order.id}/events`)
      .set(bearer(admin))
      .send({ note: 'ok' })
      .expect(400);
    const event = await http()
      .post(`${API}/admin/orders/${order.id}/events`)
      .set(bearer(admin))
      .send({
        note: 'Parcel reached the <b>Kovilpatti</b> facility',
        notifyCustomer: true,
      })
      .expect(201);
    expect(event.body.timeline.at(-1)).toMatchObject({
      status: null,
      title: 'Shipment update',
      note: 'Parcel reached the Kovilpatti facility',
    });
    await waitForMail(`Update on your order #${order.orderNumber}`);
    // The tracking update above did not notify (notifyCustomer defaults to false there).
    expect(
      mailsTo(app, customer.email)
        .slice(mailCount)
        .map((m) => m.subject),
    ).toEqual([`Update on your order #${order.orderNumber}`]);

    await setStatus(order.id, { status: 'out_for_delivery' }).expect(200);
    await waitForMail(`Your order #${order.orderNumber} is out for delivery`);

    const delivered = await setStatus(order.id, {
      status: 'delivered',
    }).expect(200);
    expect(delivered.body.status).toBe('delivered');
    expect(delivered.body.allowedTransitions).toEqual([]);
    expect(delivered.body.tracking.deliveredAt).toEqual(expect.any(String));
    expect(delivered.body.customer).toEqual({
      id: customer.id,
      email: customer.email,
      firstName: 'Test',
      lastName: 'User',
      phone: null,
    });
    await waitForMail(`Your order #${order.orderNumber} has been delivered`);

    // The customer sees tracking and the full timeline, oldest first.
    const mine = await http()
      .get(`${API}/orders/${order.orderNumber}`)
      .set(bearer(customer.accessToken))
      .expect(200);
    expect(mine.body.tracking).toMatchObject({
      carrier: 'Delhivery',
      trackingNumber: 'DLV987654321IN',
    });
    expect(mine.body.timeline.map((e: { title: string }) => e.title)).toEqual([
      'Order placed',
      'Payment received',
      'Order confirmed',
      'Packed and ready to ship',
      'Shipped',
      'Tracking updated',
      'Shipment update',
      'Out for delivery',
      'Delivered',
    ]);
    expect(
      mine.body.timeline.map((e: { status: string | null }) => e.status),
    ).toEqual([
      'pending_payment',
      'paid',
      'processing',
      'packed',
      'shipped',
      null,
      null,
      'out_for_delivery',
      'delivered',
    ]);
    expect(
      mine.body.timeline.map((e: { actor: string }) => e.actor).slice(0, 3),
    ).toEqual(['customer', 'system', 'admin']);
    const times = mine.body.timeline.map((e: { createdAt: string }) =>
      new Date(e.createdAt).getTime(),
    );
    expect([...times].sort((a, b) => a - b)).toEqual(times);
    expect(Object.keys(mine.body.timeline[0]).sort()).toEqual([
      'actor',
      'createdAt',
      'id',
      'note',
      'status',
      'title',
    ]);

    // Lists carry tracking but no timeline.
    const list = await http()
      .get(`${API}/orders`)
      .set(bearer(customer.accessToken))
      .expect(200);
    const listed = list.body.data.find(
      (o: { id: string }) => o.id === order.id,
    );
    expect(listed.tracking.trackingNumber).toBe('DLV987654321IN');
    expect(listed).not.toHaveProperty('timeline');

    const adminList = await http()
      .get(`${API}/admin/orders?status=delivered&search=${order.orderNumber}`)
      .set(bearer(admin))
      .expect(200);
    expect(adminList.body.data[0]).toMatchObject({
      id: order.id,
      status: 'delivered',
      tracking: { carrier: 'Delhivery', trackingNumber: 'DLV987654321IN' },
    });
    expect(adminList.body.data[0].tracking.estimatedDeliveryAt).toBe(eta);
  });

  it('keeps an explicit ETA, respects notifyCustomer=false and lets the store cancel a packed order', async () => {
    const order = await placeOrder('standard');
    await payFor(order.orderNumber);
    await setStatus(order.id, { status: 'processing' }).expect(200);

    const eta = new Date(Date.now() + 10 * DAY_MS).toISOString();
    const shipped = await setStatus(order.id, {
      status: 'shipped',
      estimatedDeliveryAt: eta,
      notifyCustomer: false,
    }).expect(200);
    expect(shipped.body.tracking.estimatedDeliveryAt).toBe(eta);
    expect(shipped.body.tracking.carrier).toBeNull();
    // Give a background email a chance to (wrongly) arrive.
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(subjects()).not.toContain(
      `Your order #${order.orderNumber} has shipped`,
    );

    // Standard shipping defaults to five days when no ETA is given.
    const other = await placeOrder('standard');
    await payFor(other.orderNumber);
    await setStatus(other.id, { status: 'processing' }).expect(200);
    const packed = await setStatus(other.id, { status: 'packed' }).expect(200);
    expect(packed.body.allowedTransitions).toEqual(['shipped', 'cancelled']);
    const cancelled = await setStatus(other.id, {
      status: 'cancelled',
      note: 'Out of stock',
    }).expect(200);
    expect(cancelled.body.status).toBe('cancelled');
    expect(cancelled.body.timeline.at(-1)).toMatchObject({
      status: 'cancelled',
      title: 'Cancelled by store',
      note: 'Out of stock',
    });
    await waitForMail(`Your order #${other.orderNumber} has been cancelled`);

    const third = await placeOrder('standard');
    await payFor(third.orderNumber);
    await setStatus(third.id, { status: 'processing' }).expect(200);
    const before = Date.now();
    const standard = await setStatus(third.id, { status: 'shipped' }).expect(
      200,
    );
    const etaMs = new Date(
      standard.body.tracking.estimatedDeliveryAt,
    ).getTime();
    expect(etaMs).toBeGreaterThanOrEqual(before + 5 * DAY_MS - 1000);
    expect(etaMs).toBeLessThan(Date.now() + 5 * DAY_MS + 1000);
  });

  it('records customer cancellations on the timeline', async () => {
    const order = await placeOrder('standard');
    await http()
      .post(`${API}/orders/${order.orderNumber}/cancel`)
      .set(bearer(customer.accessToken))
      .expect(200);
    const res = await http()
      .get(`${API}/orders/${order.orderNumber}`)
      .set(bearer(customer.accessToken))
      .expect(200);
    expect(res.body.timeline).toEqual([
      expect.objectContaining({
        status: 'pending_payment',
        title: 'Order placed',
        actor: 'customer',
      }),
      expect.objectContaining({
        status: 'cancelled',
        title: 'Cancelled by customer',
        actor: 'customer',
      }),
    ]);
    await waitForMail(`Your order #${order.orderNumber} has been cancelled`);
  });

  it('does not let customers use the admin order endpoints', async () => {
    const order = await placeOrder('standard');
    const token = customer.accessToken;
    await setStatus(order.id, { status: 'cancelled' }, token).expect(403);
    await http()
      .patch(`${API}/admin/orders/${order.id}/tracking`)
      .set(bearer(token))
      .send({ carrier: 'Fake' })
      .expect(403);
    await http()
      .post(`${API}/admin/orders/${order.id}/events`)
      .set(bearer(token))
      .send({ note: 'Delivered (not really)' })
      .expect(403);
    await http()
      .post(`${API}/admin/orders/${order.id}/events`)
      .send({ note: 'Anonymous update' })
      .expect(401);
  });

  it('includes the new statuses in the dashboard', async () => {
    const res = await http()
      .get(`${API}/admin/dashboard`)
      .set(bearer(admin))
      .expect(200);
    expect(res.body.ordersByStatus).toHaveProperty('packed');
    expect(res.body.ordersByStatus).toHaveProperty('out_for_delivery');
    expect(res.body.ordersByStatus.delivered).toBeGreaterThanOrEqual(1);
  });
});
