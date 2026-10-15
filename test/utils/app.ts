import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../../src/app.module.js';
import { configureApp } from '../../src/app.setup.js';
import {
  MailService,
  type SentMail,
} from '../../src/modules/mail/mail.service.js';

export const API = '/api/v1';

export async function createTestApp(): Promise<NestExpressApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({
    rawBody: true,
    logger: ['error'],
  });
  configureApp(app);
  await app.init();
  return app;
}

export type Http = ReturnType<typeof request>;

export interface TestUser {
  id: string;
  email: string;
  password: string;
  accessToken: string;
  refreshToken: string;
}

export const uniqueEmail = (prefix = 'user') =>
  `${prefix}.${randomUUID().slice(0, 8)}@example.com`;

/** Emails captured by the in-memory transport (MAIL_TRANSPORT=memory in .env.test). */
export const mailsTo = (
  app: NestExpressApplication,
  email: string,
): SentMail[] =>
  app.get(MailService).outbox.filter((mail) => mail.to === email.toLowerCase());

/** The newest OTP code emailed to an address. */
export function latestCode(app: NestExpressApplication, email: string): string {
  const mail = mailsTo(app, email).at(-1);
  const code = mail && /Your code: (\d{6})/.exec(mail.text)?.[1];
  if (!code) throw new Error(`No OTP email found for ${email}`);
  return code;
}

/** Registers a customer, confirms the emailed code and returns a signed-in user. */
export async function registerUser(
  app: NestExpressApplication,
  prefix = 'user',
): Promise<TestUser> {
  const email = uniqueEmail(prefix);
  const password = 'Secret@1234';
  const http = () => request(app.getHttpServer());
  await http()
    .post(`${API}/auth/register`)
    .send({ email, password, firstName: 'Test', lastName: 'User' })
    .expect(201);
  const res = await http()
    .post(`${API}/auth/verify-email`)
    .send({ email, code: latestCode(app, email) })
    .expect(200);
  return {
    id: res.body.user.id,
    email,
    password,
    accessToken: res.body.accessToken,
    refreshToken: res.body.refreshToken,
  };
}

export async function loginAdmin(app: NestExpressApplication): Promise<string> {
  const res = await request(app.getHttpServer())
    .post(`${API}/auth/login`)
    .send({
      email: process.env.ADMIN_EMAIL,
      password: process.env.ADMIN_PASSWORD,
    })
    .expect(200);
  return res.body.accessToken;
}

export const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

export const shippingAddress = {
  firstName: 'Sofia',
  lastName: 'Havertz',
  phone: '+91 98765 43210',
  line1: '5D/12B Pasuvanthanal Road',
  city: 'Kovilpatti',
  state: 'Tamil Nadu',
  postalCode: '628501',
  country: 'IN',
};

/** Finds a purchasable variant of a seeded product by slug and label. */
export async function variantOf(
  app: NestExpressApplication,
  slug: string,
  label?: string,
) {
  const res = await request(app.getHttpServer())
    .get(`${API}/products/${slug}`)
    .expect(200);
  const variant = label
    ? res.body.variants.find((v: { label: string }) => v.label === label)
    : res.body.variants[0];
  return { product: res.body, variant };
}
