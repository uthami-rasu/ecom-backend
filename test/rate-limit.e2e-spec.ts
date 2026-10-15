import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { API, createTestApp } from './utils/app.js';

// Must be set before the app (and its config) is created.
vi.hoisted(() => {
  process.env.AUTH_THROTTLE_LIMIT = '3';
});

describe('Rate limiting (e2e)', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(() => app.close());

  it('throttles repeated login attempts with 429', async () => {
    const http = () => request(app.getHttpServer());
    const attempt = () =>
      http()
        .post(`${API}/auth/login`)
        .send({ email: 'brute@example.com', password: 'Guess@1234' });

    for (let i = 0; i < 3; i += 1) await attempt().expect(401);
    const blocked = await attempt().expect(429);
    expect(blocked.headers['retry-after-strict']).toBeDefined();

    // The strict budget does not affect ordinary catalog browsing.
    await http().get(`${API}/products?limit=1`).expect(200);
  });
});
