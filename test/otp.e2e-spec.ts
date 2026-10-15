import { Logger } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { MailService } from '../src/modules/mail/mail.service.js';
import {
  API,
  bearer,
  createTestApp,
  latestCode,
  mailsTo,
  registerUser,
  uniqueEmail,
} from './utils/app.js';

describe('Email OTP (e2e)', () => {
  let app: NestExpressApplication;
  let http: () => ReturnType<typeof request>;
  let dataSource: DataSource;

  beforeAll(async () => {
    app = await createTestApp();
    http = () => request(app.getHttpServer());
    dataSource = app.get(DataSource);
  });
  afterAll(() => app.close());

  const password = 'Honey@2026';
  const register = (email: string, firstName = 'Sofia') =>
    http()
      .post(`${API}/auth/register`)
      .send({ email, password, firstName, lastName: 'Havertz' });

  /** Moves the user's codes back in time so the resend cooldown has passed. */
  const passCooldown = (email: string) =>
    dataSource.query(
      `UPDATE email_otps SET created_at = created_at - interval '2 minutes'
       WHERE user_id = (SELECT id FROM users WHERE email = $1)`,
      [email],
    );

  const wrongCode = (code: string) => (code === '000000' ? '111111' : '000000');

  describe('registration and verification', () => {
    it('registers, verifies the emailed code and then logs in', async () => {
      const email = uniqueEmail('otp');
      const res = await register(email).expect(201);
      expect(res.body).toEqual({
        email,
        purpose: 'verify_email',
        expiresInSeconds: 600,
        resendAfterSeconds: 60,
      });
      const [mail] = mailsTo(app, email);
      expect(mail.subject).toContain('Verify your email');
      expect(mail.html).toContain(latestCode(app, email));

      const verified = await http()
        .post(`${API}/auth/verify-email`)
        .send({ email, code: latestCode(app, email) })
        .expect(200);
      expect(verified.body.accessToken).toEqual(expect.any(String));
      expect(verified.body.user).toMatchObject({ email, emailVerified: true });

      const login = await http()
        .post(`${API}/auth/login`)
        .send({ email, password })
        .expect(200);
      expect(login.body.user.emailVerified).toBe(true);
      const me = await http()
        .get(`${API}/auth/me`)
        .set(bearer(login.body.accessToken))
        .expect(200);
      expect(me.body.emailVerified).toBe(true);

      // A code works once only.
      await http()
        .post(`${API}/auth/verify-email`)
        .send({ email, code: latestCode(app, email) })
        .expect(400);
    });

    it('rejects a wrong code and an unknown email with the same error', async () => {
      const email = uniqueEmail('otpwrong');
      await register(email).expect(201);
      const wrong = await http()
        .post(`${API}/auth/verify-email`)
        .send({ email, code: wrongCode(latestCode(app, email)) })
        .expect(400);
      expect(wrong.body.message).toBe('Invalid or expired code');

      const unknown = await http()
        .post(`${API}/auth/verify-email`)
        .send({ email: uniqueEmail('ghost'), code: '123456' })
        .expect(400);
      expect(unknown.body.message).toBe(wrong.body.message);

      await http()
        .post(`${API}/auth/verify-email`)
        .send({ email, code: '12ab56' })
        .expect(400);
    });

    it('burns the code after the maximum number of attempts', async () => {
      const email = uniqueEmail('otpmax');
      await register(email).expect(201);
      const code = latestCode(app, email);
      for (let i = 0; i < 4; i += 1) {
        const res = await http()
          .post(`${API}/auth/verify-email`)
          .send({ email, code: wrongCode(code) })
          .expect(400);
        expect(res.body.message).toBe('Invalid or expired code');
      }
      const burnt = await http()
        .post(`${API}/auth/verify-email`)
        .send({ email, code: wrongCode(code) })
        .expect(400);
      expect(burnt.body.message).toBe('Too many attempts. Request a new code.');

      // The correct code is useless now…
      await http()
        .post(`${API}/auth/verify-email`)
        .send({ email, code })
        .expect(400);
      // …until a new one is requested.
      await passCooldown(email);
      await http()
        .post(`${API}/auth/resend-otp`)
        .send({ email, purpose: 'verify_email' })
        .expect(202);
      await http()
        .post(`${API}/auth/verify-email`)
        .send({ email, code: latestCode(app, email) })
        .expect(200);
    });

    it('rejects registering a verified email but lets an unverified one re-register', async () => {
      const verified = await registerUser(app, 'otpdup');
      await register(verified.email).expect(409);

      const email = uniqueEmail('otpredo');
      await register(email, 'First').expect(201);
      await passCooldown(email);
      await register(email, 'Second').expect(201);
      expect(mailsTo(app, email)).toHaveLength(2);
      const res = await http()
        .post(`${API}/auth/verify-email`)
        .send({ email, code: latestCode(app, email) })
        .expect(200);
      expect(res.body.user.firstName).toBe('Second');
    });

    it('returns 503 when the code cannot be emailed', async () => {
      const mail = app.get(MailService);
      const quiet = vi
        .spyOn(Logger.prototype, 'error')
        .mockImplementation(() => undefined);
      const spy = vi
        .spyOn(mail as unknown as { deliver: () => Promise<void> }, 'deliver')
        .mockRejectedValueOnce(new Error('SMTP down'));
      const res = await register(uniqueEmail('otpdown')).expect(503);
      expect(res.body.message).toBe('Could not send email, please try again');
      spy.mockRestore();
      quiet.mockRestore();
    });
  });

  describe('resend and login of unverified accounts', () => {
    it('applies the resend cooldown and never reveals whether an account exists', async () => {
      const email = uniqueEmail('otpresend');
      await register(email).expect(201);
      const first = latestCode(app, email);

      const again = await http()
        .post(`${API}/auth/resend-otp`)
        .send({ email, purpose: 'verify_email' })
        .expect(202);
      expect(mailsTo(app, email)).toHaveLength(1); // still cooling down

      const ghostEmail = uniqueEmail('ghost');
      const ghost = await http()
        .post(`${API}/auth/resend-otp`)
        .send({ email: ghostEmail, purpose: 'verify_email' })
        .expect(202);
      expect({ ...ghost.body, email }).toEqual(again.body);
      expect(mailsTo(app, ghostEmail)).toHaveLength(0);

      await passCooldown(email);
      await http()
        .post(`${API}/auth/resend-otp`)
        .send({ email, purpose: 'verify_email' })
        .expect(202);
      expect(mailsTo(app, email)).toHaveLength(2);
      const second = latestCode(app, email);
      if (second !== first)
        await http()
          .post(`${API}/auth/verify-email`)
          .send({ email, code: first })
          .expect(400); // superseded
      await http()
        .post(`${API}/auth/verify-email`)
        .send({ email, code: second })
        .expect(200);

      // Already verified: still 202, nothing sent.
      await passCooldown(email);
      await http()
        .post(`${API}/auth/resend-otp`)
        .send({ email, purpose: 'verify_email' })
        .expect(202);
      expect(mailsTo(app, email)).toHaveLength(2);

      await http()
        .post(`${API}/auth/resend-otp`)
        .send({ email, purpose: 'change_email' })
        .expect(400);
    });

    it('answers a correct password on an unverified account with 403 EMAIL_NOT_VERIFIED', async () => {
      const email = uniqueEmail('otplogin');
      await register(email).expect(201);

      await http()
        .post(`${API}/auth/login`)
        .send({ email, password: 'Wrong@1234' })
        .expect(401);

      const res = await http()
        .post(`${API}/auth/login`)
        .send({ email, password })
        .expect(403);
      expect(res.body).toEqual({
        statusCode: 403,
        error: 'Forbidden',
        code: 'EMAIL_NOT_VERIFIED',
        message: 'Please verify your email to continue',
        email,
      });
      expect(res.body).not.toHaveProperty('accessToken');
      expect(mailsTo(app, email)).toHaveLength(1); // cooldown respected

      await passCooldown(email);
      await http()
        .post(`${API}/auth/login`)
        .send({ email, password })
        .expect(403);
      expect(mailsTo(app, email)).toHaveLength(2);
      await http()
        .post(`${API}/auth/verify-email`)
        .send({ email, code: latestCode(app, email) })
        .expect(200);
      await http()
        .post(`${API}/auth/login`)
        .send({ email, password })
        .expect(200);
    });
  });

  describe('password reset', () => {
    it('resets the password with an emailed code and revokes old sessions', async () => {
      const user = await registerUser(app, 'otpreset');
      const forgot = await http()
        .post(`${API}/auth/forgot-password`)
        .send({ email: user.email })
        .expect(202);
      expect(forgot.body).toEqual({
        email: user.email,
        purpose: 'reset_password',
        expiresInSeconds: 600,
        resendAfterSeconds: 60,
      });
      expect(mailsTo(app, user.email).at(-1)!.subject).toContain(
        'Reset your password',
      );

      const ghostEmail = uniqueEmail('ghost');
      await http()
        .post(`${API}/auth/forgot-password`)
        .send({ email: ghostEmail })
        .expect(202);
      expect(mailsTo(app, ghostEmail)).toHaveLength(0);

      const code = latestCode(app, user.email);
      const wrong = await http()
        .post(`${API}/auth/reset-password`)
        .send({
          email: user.email,
          code: wrongCode(code),
          newPassword: 'Brand@New99',
        })
        .expect(400);
      expect(wrong.body.message).toBe('Invalid or expired code');
      await http()
        .post(`${API}/auth/reset-password`)
        .send({ email: user.email, code, newPassword: 'weak' })
        .expect(400);

      const reset = await http()
        .post(`${API}/auth/reset-password`)
        .send({ email: user.email, code, newPassword: 'Brand@New99' })
        .expect(200);
      expect(reset.body.accessToken).toEqual(expect.any(String));
      expect(reset.body.user.email).toBe(user.email);

      await http()
        .post(`${API}/auth/refresh`)
        .send({ refreshToken: user.refreshToken })
        .expect(401);
      await http()
        .post(`${API}/auth/refresh`)
        .send({ refreshToken: reset.body.refreshToken })
        .expect(200);
      await http()
        .post(`${API}/auth/login`)
        .send({ email: user.email, password: user.password })
        .expect(401);
      await http()
        .post(`${API}/auth/login`)
        .send({ email: user.email, password: 'Brand@New99' })
        .expect(200);
    });

    it('verifies the email of an unverified account that resets its password', async () => {
      const email = uniqueEmail('otpresetunverified');
      await register(email).expect(201);
      await http()
        .post(`${API}/auth/forgot-password`)
        .send({ email })
        .expect(202);
      const reset = await http()
        .post(`${API}/auth/reset-password`)
        .send({
          email,
          code: latestCode(app, email),
          newPassword: 'Brand@New99',
        })
        .expect(200);
      expect(reset.body.user.emailVerified).toBe(true);
    });
  });

  describe('email change', () => {
    const requestChange = (token: string, body: object) =>
      http().post(`${API}/users/me/email-change`).set(bearer(token)).send(body);
    const confirm = (token: string, code: string) =>
      http()
        .post(`${API}/users/me/email-change/confirm`)
        .set(bearer(token))
        .send({ code });

    it('changes the email after confirming a code sent to the new address', async () => {
      const user = await registerUser(app, 'otpmove');
      const other = await registerUser(app, 'otptaken');
      const newEmail = uniqueEmail('otpmoved');

      await http()
        .post(`${API}/users/me/email-change`)
        .send({ newEmail, password: user.password })
        .expect(401);
      await requestChange(user.accessToken, {
        newEmail,
        password: 'Wrong@1234',
      }).expect(401);
      await requestChange(user.accessToken, {
        newEmail: user.email,
        password: user.password,
      }).expect(400);
      await requestChange(user.accessToken, {
        newEmail: other.email.toUpperCase(),
        password: user.password,
      }).expect(409);

      const challenge = await requestChange(user.accessToken, {
        newEmail: newEmail.toUpperCase(),
        password: user.password,
      }).expect(202);
      expect(challenge.body).toEqual({
        email: newEmail,
        purpose: 'change_email',
        expiresInSeconds: 600,
        resendAfterSeconds: 60,
      });
      const code = latestCode(app, newEmail);
      expect(mailsTo(app, user.email).at(-1)!.text).not.toContain(code);

      const wrong = await confirm(user.accessToken, wrongCode(code)).expect(
        400,
      );
      expect(wrong.body.message).toBe('Invalid or expired code');
      const profile = await confirm(user.accessToken, code).expect(200);
      expect(profile.body).toMatchObject({
        email: newEmail,
        emailVerified: true,
      });

      // The old address is told about the change.
      await vi.waitFor(() =>
        expect(mailsTo(app, user.email).at(-1)!.subject).toBe(
          'Your email address was changed',
        ),
      );
      expect(mailsTo(app, user.email).at(-1)!.text).toContain(newEmail);

      await http()
        .post(`${API}/auth/login`)
        .send({ email: user.email, password: user.password })
        .expect(401);
      await http()
        .post(`${API}/auth/login`)
        .send({ email: newEmail, password: user.password })
        .expect(200);
    });

    it('refuses to apply the change if the address was taken in the meantime', async () => {
      const user = await registerUser(app, 'otprace');
      const newEmail = uniqueEmail('otpcontested');
      await requestChange(user.accessToken, {
        newEmail,
        password: user.password,
      }).expect(202);
      const code = latestCode(app, newEmail);

      // Someone else registers and verifies the address first.
      await register(newEmail).expect(201);
      await http()
        .post(`${API}/auth/verify-email`)
        .send({ email: newEmail, code: latestCode(app, newEmail) })
        .expect(200);

      await confirm(user.accessToken, code).expect(409);
      const me = await http()
        .get(`${API}/users/me`)
        .set(bearer(user.accessToken))
        .expect(200);
      expect(me.body.email).toBe(user.email);
    });
  });
});
