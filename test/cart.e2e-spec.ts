import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import {
  API,
  bearer,
  createTestApp,
  registerUser,
  shippingAddress,
  variantOf,
  type TestUser,
} from './utils/app.js';

describe('Cart, wishlist and addresses (e2e)', () => {
  let app: NestExpressApplication;
  let http: () => ReturnType<typeof request>;
  let user: TestUser;

  beforeAll(async () => {
    app = await createTestApp();
    http = () => request(app.getHttpServer());
  });
  beforeEach(async () => {
    user = await registerUser(app, 'cart');
  });
  afterAll(() => app.close());

  it('starts empty and requires authentication', async () => {
    await http().get(`${API}/cart`).expect(401);
    const res = await http()
      .get(`${API}/cart`)
      .set(bearer(user.accessToken))
      .expect(200);
    expect(res.body).toMatchObject({
      items: [],
      itemCount: 0,
      subtotal: 0,
      total: 0,
      shippingFee: 0,
    });
  });

  it('adds items, merges quantities of the same variant and computes totals server-side', async () => {
    const { variant } = await variantOf(app, 'melora-raw-forest-honey', '500g'); // ₹480
    await http()
      .post(`${API}/cart/items`)
      .set(bearer(user.accessToken))
      .send({ variantId: variant.id, quantity: 1 })
      .expect(201);
    const res = await http()
      .post(`${API}/cart/items`)
      .set(bearer(user.accessToken))
      .send({ variantId: variant.id, quantity: 2 })
      .expect(201);

    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0]).toMatchObject({
      quantity: 3,
      unitPrice: 480,
      lineTotal: 1440,
      variantLabel: '500g',
      available: true,
    });
    // ₹1440 ≥ ₹999 → standard shipping is free
    expect(res.body).toMatchObject({
      subtotal: 1440,
      shippingFee: 0,
      total: 1440,
      itemCount: 3,
    });
    expect(res.body.shippingOptions[0]).toMatchObject({
      method: 'standard',
      label: 'Free shipping',
      fee: 0,
    });
  });

  it('charges standard shipping below the free threshold and previews express', async () => {
    const { variant } = await variantOf(app, 'melora-raw-forest-honey', '250g'); // ₹270
    await http()
      .post(`${API}/cart/items`)
      .set(bearer(user.accessToken))
      .send({ variantId: variant.id, quantity: 1 })
      .expect(201);

    const standard = await http()
      .get(`${API}/cart`)
      .set(bearer(user.accessToken))
      .expect(200);
    expect(standard.body).toMatchObject({
      subtotal: 270,
      shippingFee: 49,
      total: 319,
    });
    const express = await http()
      .get(`${API}/cart?shippingMethod=express`)
      .set(bearer(user.accessToken))
      .expect(200);
    expect(express.body).toMatchObject({
      shippingMethod: 'express',
      shippingFee: 150,
      total: 420,
    });
    await http()
      .get(`${API}/cart?shippingMethod=teleport`)
      .set(bearer(user.accessToken))
      .expect(400);
  });

  it('updates and removes lines', async () => {
    const { variant } = await variantOf(app, 'royal-trail-mix', '500g');
    const added = await http()
      .post(`${API}/cart/items`)
      .set(bearer(user.accessToken))
      .send({ variantId: variant.id, quantity: 1 })
      .expect(201);
    const itemId = added.body.items[0].id;

    const updated = await http()
      .patch(`${API}/cart/items/${itemId}`)
      .set(bearer(user.accessToken))
      .send({ quantity: 4 })
      .expect(200);
    expect(updated.body.items[0].quantity).toBe(4);

    const removed = await http()
      .delete(`${API}/cart/items/${itemId}`)
      .set(bearer(user.accessToken))
      .expect(200);
    expect(removed.body.items).toHaveLength(0);
  });

  it('refuses quantities above stock or the per-line maximum', async () => {
    const { variant } = await variantOf(app, 'premium-green-kiwi', '500g'); // stock 2
    const res = await http()
      .post(`${API}/cart/items`)
      .set(bearer(user.accessToken))
      .send({ variantId: variant.id, quantity: 3 })
      .expect(409);
    expect(res.body.message).toBe('Only 2 left in stock');
    await http()
      .post(`${API}/cart/items`)
      .set(bearer(user.accessToken))
      .send({ variantId: variant.id, quantity: 21 })
      .expect(400);
    await http()
      .post(`${API}/cart/items`)
      .set(bearer(user.accessToken))
      .send({ variantId: variant.id, quantity: 0 })
      .expect(400);
  });

  it('404s for unknown variants', async () => {
    await http()
      .post(`${API}/cart/items`)
      .set(bearer(user.accessToken))
      .send({ variantId: '00000000-0000-4000-8000-000000000000', quantity: 1 })
      .expect(404);
  });

  it('applies and removes coupons, rejecting invalid ones with a reason', async () => {
    const { variant } = await variantOf(app, 'whole-premium-cashews', '500g'); // ₹799
    await http()
      .post(`${API}/cart/items`)
      .set(bearer(user.accessToken))
      .send({ variantId: variant.id, quantity: 1 })
      .expect(201);

    const expired = await http()
      .post(`${API}/cart/coupon`)
      .set(bearer(user.accessToken))
      .send({ code: 'monsoon15' })
      .expect(400);
    expect(expired.body.message).toBe('Coupon has expired');
    await http()
      .post(`${API}/cart/coupon`)
      .set(bearer(user.accessToken))
      .send({ code: 'NOPE123' })
      .expect(400);

    const applied = await http()
      .post(`${API}/cart/coupon`)
      .set(bearer(user.accessToken))
      .send({ code: 'welcome10' })
      .expect(200);
    // 10% of ₹799 = ₹79.90; ₹719.10 < ₹999 so standard shipping ₹49 applies
    expect(applied.body).toMatchObject({
      subtotal: 799,
      discount: 79.9,
      shippingFee: 49,
      total: 768.1,
      coupon: { code: 'WELCOME10' },
    });

    const removed = await http()
      .delete(`${API}/cart/coupon`)
      .set(bearer(user.accessToken))
      .expect(200);
    expect(removed.body).toMatchObject({ discount: 0, coupon: null });
  });

  it('merges a guest cart idempotently, clamping to stock', async () => {
    const kiwi = (await variantOf(app, 'premium-green-kiwi', '500g')).variant; // stock 2
    const figs = (await variantOf(app, 'premium-dried-figs', '250g')).variant;
    const body = {
      items: [
        { variantId: kiwi.id, quantity: 5 },
        { variantId: figs.id, quantity: 2 },
        { variantId: '00000000-0000-4000-8000-000000000000', quantity: 1 },
      ],
    };
    const first = await http()
      .post(`${API}/cart/merge`)
      .set(bearer(user.accessToken))
      .send(body)
      .expect(200);
    expect(
      first.body.items.find(
        (i: { variantId: string }) => i.variantId === kiwi.id,
      ).quantity,
    ).toBe(2);
    expect(first.body.skipped).toHaveLength(1);

    const second = await http()
      .post(`${API}/cart/merge`)
      .set(bearer(user.accessToken))
      .send(body)
      .expect(200);
    expect(second.body.itemCount).toBe(first.body.itemCount);
  });

  it('manages the wishlist idempotently', async () => {
    const { product } = await variantOf(app, 'acacia-gold-honey');
    await http()
      .put(`${API}/wishlist/${product.id}`)
      .set(bearer(user.accessToken))
      .expect(200);
    await http()
      .put(`${API}/wishlist/${product.id}`)
      .set(bearer(user.accessToken))
      .expect(200);

    const list = await http()
      .get(`${API}/wishlist`)
      .set(bearer(user.accessToken))
      .expect(200);
    expect(list.body.map((p: { slug: string }) => p.slug)).toEqual([
      'acacia-gold-honey',
    ]);

    await http()
      .delete(`${API}/wishlist/${product.id}`)
      .set(bearer(user.accessToken))
      .expect(204);
    expect(
      (await http().get(`${API}/wishlist`).set(bearer(user.accessToken))).body,
    ).toEqual([]);
    await http()
      .put(`${API}/wishlist/not-a-uuid`)
      .set(bearer(user.accessToken))
      .expect(400);
  });

  it('manages saved addresses with a single default', async () => {
    const first = await http()
      .post(`${API}/users/me/addresses`)
      .set(bearer(user.accessToken))
      .send({ ...shippingAddress, label: 'Home' })
      .expect(201);
    expect(first.body).toMatchObject({
      isDefaultShipping: true,
      isDefaultBilling: true,
      country: 'IN',
    });

    const second = await http()
      .post(`${API}/users/me/addresses`)
      .set(bearer(user.accessToken))
      .send({
        ...shippingAddress,
        label: 'Office',
        city: 'Chennai',
        isDefaultShipping: true,
      })
      .expect(201);
    expect(second.body.isDefaultShipping).toBe(true);

    const list = await http()
      .get(`${API}/users/me/addresses`)
      .set(bearer(user.accessToken))
      .expect(200);
    expect(
      list.body.filter(
        (a: { isDefaultShipping: boolean }) => a.isDefaultShipping,
      ),
    ).toHaveLength(1);
    expect(list.body[0].id).toBe(second.body.id);

    await http()
      .patch(`${API}/users/me/addresses/${first.body.id}`)
      .set(bearer(user.accessToken))
      .send({ city: 'Madurai' })
      .expect(200);
    await http()
      .delete(`${API}/users/me/addresses/${first.body.id}`)
      .set(bearer(user.accessToken))
      .expect(204);
    await http()
      .delete(`${API}/users/me/addresses/${first.body.id}`)
      .set(bearer(user.accessToken))
      .expect(404);
  });
});
