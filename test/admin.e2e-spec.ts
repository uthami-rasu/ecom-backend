import type { NestExpressApplication } from '@nestjs/platform-express';
import sharp from 'sharp';
import request from 'supertest';
import {
  API,
  bearer,
  createTestApp,
  loginAdmin,
  registerUser,
  shippingAddress,
  variantOf,
} from './utils/app.js';

describe('Admin APIs (e2e)', () => {
  let app: NestExpressApplication;
  let http: () => ReturnType<typeof request>;
  let admin: string;

  beforeAll(async () => {
    app = await createTestApp();
    http = () => request(app.getHttpServer());
    admin = await loginAdmin(app);
  });
  afterAll(() => app.close());

  const png = () =>
    sharp({
      create: { width: 1600, height: 1200, channels: 3, background: '#d6941a' },
    })
      .png()
      .toBuffer();

  describe('categories', () => {
    it('creates, lists, updates and deletes a category', async () => {
      const honey = (await http().get(`${API}/categories/honey`).expect(200))
        .body;
      const created = await http()
        .post(`${API}/admin/categories`)
        .set(bearer(admin))
        .send({
          name: 'Creamed Honey',
          parentId: honey.id,
          description: 'Whipped to a silky spread',
        })
        .expect(201);
      expect(created.body).toMatchObject({
        slug: 'creamed-honey',
        parentId: honey.id,
        parentName: 'Honey',
        productCount: 0,
      });

      const list = await http()
        .get(`${API}/admin/categories?search=creamed`)
        .set(bearer(admin))
        .expect(200);
      expect(list.body.meta.total).toBe(1);

      const updated = await http()
        .patch(`${API}/admin/categories/${created.body.id}`)
        .set(bearer(admin))
        .send({ isActive: false })
        .expect(200);
      expect(updated.body.isActive).toBe(false);
      // Inactive categories disappear from the public tree.
      const tree = await http().get(`${API}/categories`).expect(200);
      expect(JSON.stringify(tree.body)).not.toContain('creamed-honey');

      await http()
        .delete(`${API}/admin/categories/${created.body.id}`)
        .set(bearer(admin))
        .expect(204);
      await http()
        .get(`${API}/admin/categories/${created.body.id}`)
        .set(bearer(admin))
        .expect(404);
    });

    it('rejects duplicate slugs, deep nesting and deleting categories in use', async () => {
      await http()
        .post(`${API}/admin/categories`)
        .set(bearer(admin))
        .send({ name: 'Raw honey' })
        .expect(409);
      const rawHoney = (
        await http().get(`${API}/categories/raw-honey`).expect(200)
      ).body;
      await http()
        .post(`${API}/admin/categories`)
        .set(bearer(admin))
        .send({ name: 'Too Deep', parentId: rawHoney.id })
        .expect(400);
      const honey = (await http().get(`${API}/categories/honey`).expect(200))
        .body;
      const res = await http()
        .delete(`${API}/admin/categories/${honey.id}`)
        .set(bearer(admin))
        .expect(409);
      expect(res.body.message).toContain('sub-categories');
      await http()
        .delete(`${API}/admin/categories/${rawHoney.id}`)
        .set(bearer(admin))
        .expect(409);
    });

    it('uploads a category image', async () => {
      const created = await http()
        .post(`${API}/admin/categories`)
        .set(bearer(admin))
        .send({ name: 'Image Test Category' })
        .expect(201);
      const res = await http()
        .post(`${API}/admin/categories/${created.body.id}/image`)
        .set(bearer(admin))
        .attach('image', await png(), {
          filename: 'cat.png',
          contentType: 'image/png',
        })
        .expect(201);
      expect(res.body.imageUrl).toMatch(/\/uploads\/categories\/.+-md\.webp$/);
      await http()
        .delete(`${API}/admin/categories/${created.body.id}`)
        .set(bearer(admin))
        .expect(204);
    });
  });

  describe('products', () => {
    it('runs the full product lifecycle: create → image → variant → update → list → delete', async () => {
      const category = (
        await http().get(`${API}/categories/raw-honey`).expect(200)
      ).body;
      const created = await http()
        .post(`${API}/admin/products`)
        .set(bearer(admin))
        .send({
          name: 'Litchi Blossom Honey',
          subtitle: 'Fragrant spring honey from Muzaffarpur orchards',
          origin: 'Bihar',
          categoryId: category.id,
          isFeatured: true,
          variants: [
            { label: '250g', price: 349, compareAtPrice: 399, stock: 20 },
            { label: '500g', price: 649, stock: 10 },
          ],
        })
        .expect(201);
      const id = created.body.id;
      expect(created.body).toMatchObject({
        slug: 'litchi-blossom-honey',
        price: 349,
        isActive: true,
      });
      expect(created.body.variants).toHaveLength(2);
      expect(created.body.variants[0].sku).toMatch(
        /^LITCHI-BLOSSOM-HONEY-250G-/,
      );

      // Public catalog reflects the new product immediately (cache invalidated).
      await http().get(`${API}/products/litchi-blossom-honey`).expect(200);

      const image = await http()
        .post(`${API}/admin/products/${id}/images`)
        .set(bearer(admin))
        .field('alt', 'Jar of litchi honey')
        .attach('image', await png(), {
          filename: 'jar.png',
          contentType: 'image/png',
        })
        .expect(201);
      expect(image.body).toMatchObject({ alt: 'Jar of litchi honey' });
      const meta = await sharp(
        (await http().get(new URL(image.body.url).pathname).expect(200)).body,
      ).metadata();
      expect(meta).toMatchObject({ format: 'webp', width: 1200 });

      const variant = await http()
        .post(`${API}/admin/products/${id}/variants`)
        .set(bearer(admin))
        .send({ label: '100g', price: 149, stock: 5 })
        .expect(201);
      const detail = await http()
        .get(`${API}/products/litchi-blossom-honey`)
        .expect(200);
      expect(detail.body.price).toBe(149); // min price recalculated
      expect(detail.body.images).toHaveLength(1);

      await http()
        .patch(`${API}/admin/products/${id}/variants/${variant.body.id}`)
        .set(bearer(admin))
        .send({ price: 199, compareAtPrice: 150 })
        .expect(400);
      await http()
        .patch(`${API}/admin/products/${id}/variants/${variant.body.id}`)
        .set(bearer(admin))
        .send({ isActive: false })
        .expect(200);
      expect(
        (await http().get(`${API}/products/litchi-blossom-honey`)).body.price,
      ).toBe(349);

      const updated = await http()
        .patch(`${API}/admin/products/${id}`)
        .set(bearer(admin))
        .send({ badge: 'New season', isActive: false })
        .expect(200);
      expect(updated.body).toMatchObject({
        badge: 'New season',
        isActive: false,
      });
      await http().get(`${API}/products/litchi-blossom-honey`).expect(404);

      const list = await http()
        .get(`${API}/admin/products?search=litchi&isActive=false`)
        .set(bearer(admin))
        .expect(200);
      expect(list.body.data[0]).toMatchObject({
        name: 'Litchi Blossom Honey',
        totalStock: 30,
        variantCount: 3,
        stockStatus: 'in_stock',
      });

      await http()
        .delete(`${API}/admin/products/${id}/images/${image.body.id}`)
        .set(bearer(admin))
        .expect(204);
      await http().get(new URL(image.body.url).pathname).expect(404);

      await http()
        .delete(`${API}/admin/products/${id}`)
        .set(bearer(admin))
        .expect(204);
      await http()
        .get(`${API}/admin/products/${id}`)
        .set(bearer(admin))
        .expect(404);
    });

    it('filters the admin list by stock status and paginates', async () => {
      const low = await http()
        .get(`${API}/admin/products?stockStatus=low_stock&limit=50`)
        .set(bearer(admin))
        .expect(200);
      expect(
        low.body.data.every(
          (p: { stockStatus: string }) => p.stockStatus === 'low_stock',
        ),
      ).toBe(true);
      const page = await http()
        .get(`${API}/admin/products?limit=3&page=1&sort=name`)
        .set(bearer(admin))
        .expect(200);
      expect(page.body.data).toHaveLength(3);
      const names = page.body.data.map((p: { name: string }) => p.name);
      expect(names).toEqual(
        [...names].sort((a: string, b: string) => a.localeCompare(b)),
      );
    });

    it('validates product payloads', async () => {
      const category = (
        await http().get(`${API}/categories/raw-honey`).expect(200)
      ).body;
      await http()
        .post(`${API}/admin/products`)
        .set(bearer(admin))
        .send({ name: 'No variants', categoryId: category.id, variants: [] })
        .expect(400);
      await http()
        .post(`${API}/admin/products`)
        .set(bearer(admin))
        .send({
          name: 'Bad category',
          categoryId: '00000000-0000-4000-8000-000000000000',
          variants: [{ label: '1kg', price: 1, stock: 1 }],
        })
        .expect(400);
      await http()
        .post(`${API}/admin/products`)
        .set(bearer(admin))
        .send({
          name: 'Dupe labels',
          categoryId: category.id,
          variants: [
            { label: '1kg', price: 1, stock: 1 },
            { label: '1KG', price: 2, stock: 1 },
          ],
        })
        .expect(400);
      await http()
        .post(`${API}/admin/products`)
        .set(bearer(admin))
        .send({
          name: 'Negative',
          categoryId: category.id,
          variants: [{ label: '1kg', price: -5, stock: -1 }],
        })
        .expect(400);
    });

    it('refuses to delete the last variant of a product', async () => {
      const { product } = await variantOf(app, 'wild-hive-comb-honey');
      const adminView = await http()
        .get(`${API}/admin/products/${product.id}`)
        .set(bearer(admin))
        .expect(200);
      await http()
        .delete(
          `${API}/admin/products/${product.id}/variants/${adminView.body.variants[0].id}`,
        )
        .set(bearer(admin))
        .expect(400);
    });

    it('rejects non-image uploads even when the MIME type claims an image', async () => {
      const { product } = await variantOf(app, 'acacia-gold-honey');
      await http()
        .post(`${API}/admin/products/${product.id}/images`)
        .set(bearer(admin))
        .attach('image', Buffer.from('<?php system($_GET["c"]); ?>'), {
          filename: 'shell.png',
          contentType: 'image/png',
        })
        .expect(400);
      await http()
        .post(`${API}/admin/products/${product.id}/images`)
        .set(bearer(admin))
        .expect(400);
    });

    it('rejects uploads above the size limit', async () => {
      const { product } = await variantOf(app, 'acacia-gold-honey');
      await http()
        .post(`${API}/admin/products/${product.id}/images`)
        .set(bearer(admin))
        .attach('image', Buffer.alloc(1024 * 1024 + 10, 1), {
          filename: 'big.png',
          contentType: 'image/png',
        })
        .expect(413);
    });
  });

  describe('orders, coupons and dashboard', () => {
    it('lists orders and moves them through the fulfilment lifecycle', async () => {
      const user = await registerUser(app, 'adminorders');
      const { variant } = await variantOf(app, 'premium-sweet-rings', '250g');
      await http()
        .post(`${API}/cart/items`)
        .set(bearer(user.accessToken))
        .send({ variantId: variant.id, quantity: 1 })
        .expect(201);
      const order = (
        await http()
          .post(`${API}/orders`)
          .set(bearer(user.accessToken))
          .send({ shippingAddress })
          .expect(201)
      ).body;

      const list = await http()
        .get(`${API}/admin/orders?search=${order.orderNumber}`)
        .set(bearer(admin))
        .expect(200);
      expect(list.body.data[0]).toMatchObject({
        orderNumber: order.orderNumber,
        status: 'pending_payment',
        customerName: 'Sofia Havertz',
        itemCount: 1,
      });

      // Cannot ship an unpaid order.
      await http()
        .patch(`${API}/admin/orders/${order.id}/status`)
        .set(bearer(admin))
        .send({ status: 'shipped' })
        .expect(409);

      const initiated = await http()
        .post(`${API}/payments/orders/${order.orderNumber}`)
        .set(bearer(user.accessToken))
        .expect(201);
      const widget = await http()
        .post(`${API}/payments/${initiated.body.id}/mock-checkout`)
        .set(bearer(user.accessToken))
        .send({ outcome: 'success' })
        .expect(200);
      await http()
        .post(`${API}/payments/${initiated.body.id}/confirm`)
        .set(bearer(user.accessToken))
        .send(widget.body)
        .expect(400); // extra fields rejected
      await http()
        .post(`${API}/payments/${initiated.body.id}/confirm`)
        .set(bearer(user.accessToken))
        .send({
          providerPaymentId: widget.body.providerPaymentId,
          signature: widget.body.signature,
        })
        .expect(200);

      for (const status of ['processing', 'shipped', 'delivered']) {
        const res = await http()
          .patch(`${API}/admin/orders/${order.id}/status`)
          .set(bearer(admin))
          .send({ status })
          .expect(200);
        expect(res.body.status).toBe(status);
      }
      const final = await http()
        .get(`${API}/admin/orders/${order.id}`)
        .set(bearer(admin))
        .expect(200);
      expect(final.body.allowedTransitions).toEqual([]);
    });

    it('creates, updates and deletes coupons with validation', async () => {
      await http()
        .post(`${API}/admin/coupons`)
        .set(bearer(admin))
        .send({ code: 'BAD', type: 'percentage', value: 150 })
        .expect(400);
      await http()
        .post(`${API}/admin/coupons`)
        .set(bearer(admin))
        .send({ code: 'WELCOME10', type: 'percentage', value: 5 })
        .expect(409);

      const created = await http()
        .post(`${API}/admin/coupons`)
        .set(bearer(admin))
        .send({
          code: 'diwali50',
          type: 'fixed',
          value: 50,
          minSubtotal: 500,
          usageLimit: 100,
        })
        .expect(201);
      expect(created.body).toMatchObject({
        code: 'DIWALI50',
        value: 50,
        minSubtotal: 500,
        usedCount: 0,
      });

      const updated = await http()
        .patch(`${API}/admin/coupons/${created.body.id}`)
        .set(bearer(admin))
        .send({ isActive: false })
        .expect(200);
      expect(updated.body.isActive).toBe(false);
      await http()
        .delete(`${API}/admin/coupons/${created.body.id}`)
        .set(bearer(admin))
        .expect(204);
    });

    it('returns dashboard statistics', async () => {
      const res = await http()
        .get(`${API}/admin/dashboard`)
        .set(bearer(admin))
        .expect(200);
      expect(res.body.totals.products).toBeGreaterThanOrEqual(20);
      expect(res.body.salesLast30Days).toHaveLength(30);
      expect(res.body.ordersByStatus).toHaveProperty('paid');
      expect(Array.isArray(res.body.lowStock)).toBe(true);
    });

    it('lists and resolves contact messages', async () => {
      await http()
        .post(`${API}/contact`)
        .send({
          fullName: 'John Doe',
          email: 'john@example.com',
          phone: '+91 98765 43210',
          subject: 'Order support',
          message: 'Where is my order please?',
          consent: true,
        })
        .expect(201);
      const list = await http()
        .get(`${API}/admin/contact-messages`)
        .set(bearer(admin))
        .expect(200);
      const message = list.body.data.find(
        (m: { email: string }) => m.email === 'john@example.com',
      );
      await http()
        .patch(`${API}/admin/contact-messages/${message.id}/resolve`)
        .set(bearer(admin))
        .expect(200);
    });
  });
});
