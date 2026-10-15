import type { NestExpressApplication } from '@nestjs/platform-express';
import { createHmac } from 'node:crypto';
import request from 'supertest';
import {
  API,
  bearer,
  createTestApp,
  latestCode,
  loginAdmin,
  registerUser,
  shippingAddress,
  variantOf,
  type TestUser,
} from './utils/app.js';

const b64url = (value: object) =>
  Buffer.from(JSON.stringify(value)).toString('base64url');

describe('Security (e2e)', () => {
  let app: NestExpressApplication;
  let http: () => ReturnType<typeof request>;
  let customer: TestUser;

  beforeAll(async () => {
    app = await createTestApp();
    http = () => request(app.getHttpServer());
    customer = await registerUser(app, 'security');
  });
  afterAll(() => app.close());

  describe('authentication is required', () => {
    it.each([
      ['get', '/cart'],
      ['post', '/cart/items'],
      ['get', '/orders'],
      ['post', '/orders'],
      ['get', '/wishlist'],
      ['get', '/users/me'],
      ['get', '/users/me/addresses'],
      ['post', '/payments/orders/BSC-ABCDEFGH'],
      ['get', '/admin/dashboard'],
      ['get', '/admin/products'],
      ['post', '/admin/categories'],
    ] as const)('%s %s → 401', async (method, path) => {
      await http()[method](`${API}${path}`).expect(401);
    });
  });

  describe('role-based access control', () => {
    it.each([
      ['get', '/admin/dashboard'],
      ['get', '/admin/categories'],
      ['post', '/admin/categories'],
      ['get', '/admin/products'],
      ['post', '/admin/products'],
      ['delete', '/admin/products/00000000-0000-4000-8000-000000000000'],
      ['get', '/admin/orders'],
      ['get', '/admin/coupons'],
      ['get', '/admin/contact-messages'],
    ] as const)('customer %s %s → 403', async (method, path) => {
      await http()
        [method](`${API}${path}`)
        .set(bearer(customer.accessToken))
        .send({})
        .expect(403);
    });

    it('admin can reach admin routes', async () => {
      const admin = await loginAdmin(app);
      await http().get(`${API}/admin/dashboard`).set(bearer(admin)).expect(200);
    });
  });

  describe('JWT tampering', () => {
    it('rejects a token whose payload was edited to role=admin', async () => {
      const [header, payload, signature] = customer.accessToken.split('.');
      const claims = JSON.parse(Buffer.from(payload, 'base64url').toString());
      const forged = `${header}.${b64url({ ...claims, role: 'admin' })}.${signature}`;
      await http()
        .get(`${API}/admin/dashboard`)
        .set(bearer(forged))
        .expect(401);
    });

    it('rejects "alg: none" tokens', async () => {
      const claims = JSON.parse(
        Buffer.from(customer.accessToken.split('.')[1], 'base64url').toString(),
      );
      const none = `${b64url({ alg: 'none', typ: 'JWT' })}.${b64url({ ...claims, role: 'admin' })}.`;
      await http().get(`${API}/admin/dashboard`).set(bearer(none)).expect(401);
      await http().get(`${API}/users/me`).set(bearer(none)).expect(401);
    });

    it('rejects tokens signed with another secret', async () => {
      const header = b64url({ alg: 'HS256', typ: 'JWT' });
      const body = b64url({
        sub: customer.id,
        email: customer.email,
        role: 'admin',
        typ: 'access',
        exp: Math.floor(Date.now() / 1000) + 600,
      });
      const signature = createHmac('sha256', 'not-the-real-secret')
        .update(`${header}.${body}`)
        .digest('base64url');
      await http()
        .get(`${API}/users/me`)
        .set(bearer(`${header}.${body}.${signature}`))
        .expect(401);
    });

    it('rejects refresh tokens and garbage used as access tokens', async () => {
      await http()
        .get(`${API}/users/me`)
        .set(bearer(customer.refreshToken))
        .expect(401);
      await http().get(`${API}/users/me`).set(bearer('garbage')).expect(401);
      await http()
        .get(`${API}/users/me`)
        .set('Authorization', customer.accessToken)
        .expect(401); // missing scheme
    });
  });

  describe('mass assignment / privilege escalation', () => {
    it('rejects a role in the registration payload', async () => {
      const res = await http()
        .post(`${API}/auth/register`)
        .send({
          email: 'sneaky@example.com',
          password: 'Secret@1234',
          firstName: 'A',
          lastName: 'B',
          role: 'admin',
        })
        .expect(400);
      expect(res.body.message).toContain('property role should not exist');
    });

    it('rejects role/isActive in profile updates', async () => {
      await http()
        .patch(`${API}/users/me`)
        .set(bearer(customer.accessToken))
        .send({ role: 'admin' })
        .expect(400);
      await http()
        .patch(`${API}/users/me`)
        .set(bearer(customer.accessToken))
        .send({ isActive: true })
        .expect(400);
    });

    it('rejects client-supplied prices on cart and checkout', async () => {
      const { variant } = await variantOf(app, 'royal-trail-mix', '250g');
      await http()
        .post(`${API}/cart/items`)
        .set(bearer(customer.accessToken))
        .send({ variantId: variant.id, quantity: 1, price: 1 })
        .expect(400);
      await http()
        .post(`${API}/orders`)
        .set(bearer(customer.accessToken))
        .send({ shippingAddress, total: 1 })
        .expect(400);
    });
  });

  describe('object-level authorisation (IDOR)', () => {
    it("hides one customer's orders, payments, cart items and addresses from another", async () => {
      const victim = await registerUser(app, 'victim');
      const attacker = await registerUser(app, 'attacker');

      const { variant } = await variantOf(app, 'premium-black-prunes', '250g');
      const cart = await http()
        .post(`${API}/cart/items`)
        .set(bearer(victim.accessToken))
        .send({ variantId: variant.id, quantity: 1 })
        .expect(201);
      const address = await http()
        .post(`${API}/users/me/addresses`)
        .set(bearer(victim.accessToken))
        .send(shippingAddress)
        .expect(201);

      await http()
        .patch(`${API}/cart/items/${cart.body.items[0].id}`)
        .set(bearer(attacker.accessToken))
        .send({ quantity: 5 })
        .expect(404);
      await http()
        .delete(`${API}/cart/items/${cart.body.items[0].id}`)
        .set(bearer(attacker.accessToken))
        .expect(404);
      await http()
        .patch(`${API}/users/me/addresses/${address.body.id}`)
        .set(bearer(attacker.accessToken))
        .send({ city: 'Madurai' })
        .expect(404);
      await http()
        .delete(`${API}/users/me/addresses/${address.body.id}`)
        .set(bearer(attacker.accessToken))
        .expect(404);
      await http()
        .post(`${API}/orders`)
        .set(bearer(attacker.accessToken))
        .send({ shippingAddressId: address.body.id })
        .expect(404);

      const order = await http()
        .post(`${API}/orders`)
        .set(bearer(victim.accessToken))
        .send({ shippingAddress })
        .expect(201);
      const payment = await http()
        .post(`${API}/payments/orders/${order.body.orderNumber}`)
        .set(bearer(victim.accessToken))
        .expect(201);

      await http()
        .get(`${API}/orders/${order.body.orderNumber}`)
        .set(bearer(attacker.accessToken))
        .expect(404);
      await http()
        .post(`${API}/orders/${order.body.orderNumber}/cancel`)
        .set(bearer(attacker.accessToken))
        .expect(404);
      await http()
        .post(`${API}/payments/orders/${order.body.orderNumber}`)
        .set(bearer(attacker.accessToken))
        .expect(404);
      await http()
        .get(`${API}/payments/${payment.body.id}`)
        .set(bearer(attacker.accessToken))
        .expect(404);
      await http()
        .post(`${API}/payments/${payment.body.id}/mock-checkout`)
        .set(bearer(attacker.accessToken))
        .send({ outcome: 'success' })
        .expect(404);

      const attackerOrders = await http()
        .get(`${API}/orders`)
        .set(bearer(attacker.accessToken))
        .expect(200);
      expect(attackerOrders.body.meta.total).toBe(0);
    });
  });

  describe('SQL injection attempts', () => {
    it.each([
      `' OR 1=1 --`,
      `'; DROP TABLE products; --`,
      `honey' UNION SELECT password_hash FROM users --`,
      `%' AND pg_sleep(5) --`,
    ])('search %j is treated as data', async (payload) => {
      const started = Date.now();
      const res = await http()
        .get(`${API}/products`)
        .query({ search: payload })
        .expect(200);
      expect(res.body.meta.total).toBe(0);
      expect(Date.now() - started).toBeLessThan(3000);
    });

    it('rejects injection through slugs, sizes, sort and order numbers', async () => {
      await http()
        .get(`${API}/products/${encodeURIComponent("x' OR '1'='1")}`)
        .expect(404);
      await http()
        .get(`${API}/products`)
        .query({ category: "honey' OR '1'='1" })
        .expect(400);
      const sizes = await http()
        .get(`${API}/products`)
        .query({ sizes: "250g') OR ('1'='1" })
        .expect(200);
      expect(sizes.body.meta.total).toBe(0);
      await http()
        .get(`${API}/products`)
        .query({ sort: 'p.name; DELETE FROM products' })
        .expect(400);
      await http()
        .get(`${API}/orders/${encodeURIComponent("BSC-1' OR '1'='1")}`)
        .set(bearer(customer.accessToken))
        .expect(400);
    });

    it('rejects injection in login credentials', async () => {
      await http()
        .post(`${API}/auth/login`)
        .send({ email: `admin@test.local' OR '1'='1`, password: 'x' })
        .expect(400);
      await http()
        .post(`${API}/auth/login`)
        .send({ email: process.env.ADMIN_EMAIL, password: `' OR '1'='1` })
        .expect(401);
      await http()
        .post(`${API}/auth/login`)
        .send({ email: { $ne: null }, password: { $ne: null } })
        .expect(400);
    });

    it('catalog is intact after the attempts', async () => {
      const res = await http().get(`${API}/products?limit=1`).expect(200);
      expect(res.body.meta.total).toBeGreaterThanOrEqual(20);
    });
  });

  describe('XSS hardening', () => {
    it('strips HTML from reviews', async () => {
      const user = await registerUser(app, 'xss');
      const res = await http()
        .post(`${API}/products/green-kiwi-coins/reviews`)
        .set(bearer(user.accessToken))
        .send({
          rating: 5,
          title: '<script>alert(document.cookie)</script>Lovely',
          content:
            'Tasty <img src=x onerror="alert(1)"> kiwi & <b>fresh</b> <a href="javascript:alert(1)">link</a>',
        })
        .expect(201);
      expect(res.body.title).toBe('Lovely');
      expect(res.body.content).toBe('Tasty  kiwi & fresh link');
      expect(JSON.stringify(res.body)).not.toMatch(/<|onerror|javascript:/i);
    });

    it('strips HTML from names and admin product content', async () => {
      const email = `xss.${Date.now()}@example.com`;
      await http()
        .post(`${API}/auth/register`)
        .send({
          email,
          password: 'Secret@1234',
          firstName: '<svg onload=alert(1)>Eve',
          lastName: 'Doe',
        })
        .expect(201);
      const reg = await http()
        .post(`${API}/auth/verify-email`)
        .send({ email, code: latestCode(app, email) })
        .expect(200);
      expect(reg.body.user.firstName).toBe('Eve');

      const admin = await loginAdmin(app);
      const category = (await http().get(`${API}/categories/nuts`).expect(200))
        .body;
      const product = await http()
        .post(`${API}/admin/products`)
        .set(bearer(admin))
        .send({
          name: 'Pistachio <iframe src="https://evil.example"></iframe>Kernels',
          description:
            '<p onclick="steal()">Roasted</p><script>fetch("//evil")</script>',
          categoryId: category.id,
          variants: [{ label: '250g', price: 499, stock: 3 }],
        })
        .expect(201);
      expect(product.body.name).toBe('Pistachio Kernels');
      expect(product.body.description).toBe('Roasted');
      await http()
        .delete(`${API}/admin/products/${product.body.id}`)
        .set(bearer(admin))
        .expect(204);
    });
  });

  describe('input validation', () => {
    it('rejects malformed JSON and oversized bodies', async () => {
      await http()
        .post(`${API}/auth/login`)
        .set('Content-Type', 'application/json')
        .send('{"email": ')
        .expect(400);
      await http()
        .post(`${API}/contact`)
        .send({
          fullName: 'A'.repeat(200_000),
          email: 'a@b.co',
          phone: '+91 98765 43210',
          subject: 'Order support',
          message: 'x',
          consent: true,
        })
        .expect(413);
    });

    it('rejects wrong types, invalid UUIDs and out-of-range numbers', async () => {
      await http()
        .post(`${API}/cart/items`)
        .set(bearer(customer.accessToken))
        .send({ variantId: 'abc', quantity: 'two' })
        .expect(400);
      await http()
        .patch(`${API}/cart/items/not-a-uuid`)
        .set(bearer(customer.accessToken))
        .send({ quantity: 1 })
        .expect(400);
      await http().get(`${API}/products?page=0`).expect(400);
      await http().get(`${API}/products?minRating=9`).expect(400);
      await http().get(`${API}/products?featured=yes`).expect(400);
    });

    it('requires consent and a known subject on the contact form', async () => {
      const base = {
        fullName: 'Jane',
        email: 'jane@example.com',
        phone: '+91 98765 43210',
        subject: 'Order support',
        message: 'Hello there team',
      };
      await http()
        .post(`${API}/contact`)
        .send({ ...base, consent: false })
        .expect(400);
      await http()
        .post(`${API}/contact`)
        .send({ ...base, subject: 'Hacking', consent: true })
        .expect(400);
      await http()
        .post(`${API}/contact`)
        .send({ ...base, consent: true })
        .expect(201);
    });

    it('newsletter sign-up does not reveal whether an email is already subscribed', async () => {
      const first = await http()
        .post(`${API}/newsletter`)
        .send({ email: 'reader@example.com' })
        .expect(200);
      const second = await http()
        .post(`${API}/newsletter`)
        .send({ email: 'READER@example.com' })
        .expect(200);
      expect(second.body).toEqual(first.body);
    });
  });

  describe('transport and error hygiene', () => {
    it('sets security headers and hides the framework', async () => {
      const res = await http().get(`${API}/health`).expect(200);
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
      expect(res.headers['strict-transport-security']).toBeDefined();
      expect(res.headers['content-security-policy']).toBeDefined();
      expect(res.headers['x-powered-by']).toBeUndefined();
    });

    it('allows only configured CORS origins', async () => {
      const allowed = await http()
        .options(`${API}/products`)
        .set('Origin', 'http://localhost:5173')
        .set('Access-Control-Request-Method', 'GET');
      expect(allowed.headers['access-control-allow-origin']).toBe(
        'http://localhost:5173',
      );
      const blocked = await http()
        .options(`${API}/products`)
        .set('Origin', 'https://evil.example')
        .set('Access-Control-Request-Method', 'GET');
      expect(blocked.headers['access-control-allow-origin']).toBeUndefined();
    });

    it('does not leak database details in conflict errors', async () => {
      const res = await http()
        .post(`${API}/auth/register`)
        .send({
          email: customer.email,
          password: 'Secret@1234',
          firstName: 'A',
          lastName: 'B',
        })
        .expect(409);
      expect(JSON.stringify(res.body)).not.toMatch(
        /duplicate key|constraint|users_|SELECT|INSERT/i,
      );
    });

    it('blocks path traversal on the uploads directory', async () => {
      await http().get('/uploads/../.env').expect(404);
      await http().get('/uploads/%2e%2e/%2e%2e/.env').expect(404);
      await http().get('/uploads/.env').expect(404);
    });

    it('requires a valid signature on payment webhooks', async () => {
      await http()
        .post(`${API}/payments/webhook`)
        .send({ event: 'payment.captured' })
        .expect(401);
    });

    it('publishes the OpenAPI document', async () => {
      const res = await http().get('/api/docs-json').expect(200);
      expect(res.body.info.title).toBe('Bossco Naturals Commerce API');
      expect(Object.keys(res.body.paths)).toEqual(
        expect.arrayContaining(['/api/v1/products', '/api/v1/admin/products']),
      );
    });
  });
});
