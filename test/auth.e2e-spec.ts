import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import {
  API,
  bearer,
  createTestApp,
  latestCode,
  registerUser,
  uniqueEmail,
} from './utils/app.js';

describe('Auth (e2e)', () => {
  let app: NestExpressApplication;
  let http: () => ReturnType<typeof request>;

  beforeAll(async () => {
    app = await createTestApp();
    http = () => request(app.getHttpServer());
  });
  afterAll(() => app.close());

  it('registers a customer, then returns tokens without sensitive fields once the email is verified', async () => {
    const email = uniqueEmail('register');
    const res = await http()
      .post(`${API}/auth/register`)
      .send({
        email: email.toUpperCase(),
        password: 'Honey@2026',
        firstName: 'Sofia',
        lastName: 'Havertz',
      })
      .expect(201);
    expect(res.body).toEqual({
      email,
      purpose: 'verify_email',
      expiresInSeconds: 600,
      resendAfterSeconds: 60,
    });
    expect(res.body).not.toHaveProperty('accessToken');

    const verified = await http()
      .post(`${API}/auth/verify-email`)
      .send({ email, code: latestCode(app, email) })
      .expect(200);
    expect(verified.body).toMatchObject({
      tokenType: 'Bearer',
      expiresIn: 900,
    });
    expect(verified.body.accessToken).toEqual(expect.any(String));
    expect(verified.body.refreshToken).toEqual(expect.any(String));
    expect(verified.body.user).toMatchObject({
      email,
      role: 'customer',
      displayName: 'Sofia Havertz',
      emailVerified: true,
    });
    expect(verified.body.user).not.toHaveProperty('passwordHash');
  });

  it('rejects duplicate emails (case-insensitive) with 409', async () => {
    const user = await registerUser(app);
    await http()
      .post(`${API}/auth/register`)
      .send({
        email: user.email.toUpperCase(),
        password: 'Honey@2026',
        firstName: 'A',
        lastName: 'B',
      })
      .expect(409);
  });

  it('rejects weak passwords and malformed emails', async () => {
    const res = await http()
      .post(`${API}/auth/register`)
      .send({
        email: 'not-an-email',
        password: 'short',
        firstName: 'A',
        lastName: 'B',
      })
      .expect(400);
    expect(res.body.message).toEqual(
      expect.arrayContaining([
        expect.stringContaining('email'),
        expect.stringContaining('password must be 8-128'),
      ]),
    );
  });

  it('logs in, returns the profile from /auth/me and /users/me', async () => {
    const user = await registerUser(app);
    const login = await http()
      .post(`${API}/auth/login`)
      .send({ email: user.email, password: user.password })
      .expect(200);
    const me = await http()
      .get(`${API}/auth/me`)
      .set(bearer(login.body.accessToken))
      .expect(200);
    expect(me.body.email).toBe(user.email);
    await http()
      .get(`${API}/users/me`)
      .set(bearer(login.body.accessToken))
      .expect(200);
  });

  it('returns the same 401 message for unknown email and wrong password', async () => {
    const user = await registerUser(app);
    const wrongPassword = await http()
      .post(`${API}/auth/login`)
      .send({ email: user.email, password: 'Wrong@1234' })
      .expect(401);
    const unknown = await http()
      .post(`${API}/auth/login`)
      .send({ email: uniqueEmail('ghost'), password: 'Wrong@1234' })
      .expect(401);
    expect(wrongPassword.body.message).toBe('Invalid email or password');
    expect(unknown.body.message).toBe(wrongPassword.body.message);
  });

  it('rotates refresh tokens and detects reuse of a rotated token', async () => {
    const user = await registerUser(app);
    const first = await http()
      .post(`${API}/auth/refresh`)
      .send({ refreshToken: user.refreshToken })
      .expect(200);
    expect(first.body.refreshToken).not.toBe(user.refreshToken);

    // Replaying the original token revokes the whole family…
    await http()
      .post(`${API}/auth/refresh`)
      .send({ refreshToken: user.refreshToken })
      .expect(401);
    // …so even the newest token from that login no longer works.
    await http()
      .post(`${API}/auth/refresh`)
      .send({ refreshToken: first.body.refreshToken })
      .expect(401);
  });

  it('logout revokes the refresh token', async () => {
    const user = await registerUser(app);
    await http()
      .post(`${API}/auth/logout`)
      .send({ refreshToken: user.refreshToken })
      .expect(204);
    await http()
      .post(`${API}/auth/refresh`)
      .send({ refreshToken: user.refreshToken })
      .expect(401);
  });

  it('changes password, revoking existing sessions', async () => {
    const user = await registerUser(app);
    await http()
      .post(`${API}/auth/change-password`)
      .set(bearer(user.accessToken))
      .send({ currentPassword: 'Wrong@1234', newPassword: 'NewSecret@99' })
      .expect(401);
    const changed = await http()
      .post(`${API}/auth/change-password`)
      .set(bearer(user.accessToken))
      .send({ currentPassword: user.password, newPassword: 'NewSecret@99' })
      .expect(200);
    expect(changed.body.refreshToken).toEqual(expect.any(String));

    await http()
      .post(`${API}/auth/refresh`)
      .send({ refreshToken: user.refreshToken })
      .expect(401);
    await http()
      .post(`${API}/auth/login`)
      .send({ email: user.email, password: user.password })
      .expect(401);
    await http()
      .post(`${API}/auth/login`)
      .send({ email: user.email, password: 'NewSecret@99' })
      .expect(200);
  });

  it('updates the profile; email cannot be changed through PATCH /users/me', async () => {
    const user = await registerUser(app);
    const updated = await http()
      .patch(`${API}/users/me`)
      .set(bearer(user.accessToken))
      .send({
        firstName: 'Sofia',
        displayName: 'Sofia H.',
        phone: '+91 98765 43210',
      })
      .expect(200);
    expect(updated.body).toMatchObject({
      firstName: 'Sofia',
      displayName: 'Sofia H.',
    });

    // Email changes go through POST /users/me/email-change (see otp.e2e-spec.ts).
    const newEmail = uniqueEmail('moved');
    await http()
      .patch(`${API}/users/me`)
      .set(bearer(user.accessToken))
      .send({ email: newEmail })
      .expect(400);
    await http()
      .patch(`${API}/users/me`)
      .set(bearer(user.accessToken))
      .send({ email: newEmail, currentPassword: user.password })
      .expect(400);
    const me = await http()
      .get(`${API}/users/me`)
      .set(bearer(user.accessToken))
      .expect(200);
    expect(me.body.email).toBe(user.email);
  });
});
