import { toPaise } from '../common/utils/money.js';

export type PaymentProviderName = 'mock';

export type MailTransportName = 'smtp' | 'resend' | 'log' | 'memory';

export interface AppConfig {
  env: 'development' | 'production' | 'test';
  port: number;
  trustProxy: boolean | number;
  db: {
    host: string;
    port: number;
    user: string;
    password: string;
    name: string;
    ssl: boolean;
    sslRejectUnauthorized: boolean;
    poolMax: number;
    logging: boolean;
  };
  auth: {
    accessSecret: string;
    accessTtlSeconds: number;
    refreshTtlDays: number;
  };
  corsOrigins: string[];
  throttle: { ttlMs: number; limit: number; authLimit: number };
  cacheTtlMs: number;
  uploads: {
    dir: string;
    publicBaseUrl: string;
    maxBytes: number;
    driver: 'local' | 's3';
    s3: {
      endpoint: string;
      region: string;
      bucket: string;
      accessKeyId: string;
      secretAccessKey: string;
      publicBaseUrl: string;
      forcePathStyle: boolean;
    };
  };
  payments: {
    provider: PaymentProviderName;
    keySecret: string;
    webhookSecret: string;
  };
  /** All shipping amounts are in paise. */
  shipping: { freeThreshold: number; standardFee: number; expressFee: number };
  swaggerEnabled: boolean;
  mail: {
    transport: MailTransportName;
    resendApiKey?: string;
    host: string;
    port: number;
    secure: boolean;
    user: string | null;
    password: string | null;
    from: string;
    /** Base URL of the storefront for links in emails (no trailing slash). */
    storefrontUrl: string;
  };
  otp: { ttlSeconds: number; resendSeconds: number; maxAttempts: number };
}

const bool = (value: string | undefined, fallback: boolean): boolean =>
  value === undefined
    ? fallback
    : ['true', '1', 'yes'].includes(value.toLowerCase());

const num = (value: string | undefined, fallback: number): number =>
  value === undefined || value === '' ? fallback : Number(value);

export default (): AppConfig => {
  const env = process.env;
  const trustProxy = env.TRUST_PROXY;

  let dbHost = env.DB_HOST ?? 'localhost';
  let dbPort = num(env.DB_PORT, 5432);
  let dbUser = env.DB_USER ?? '';
  let dbPassword = env.DB_PASSWORD ?? '';
  let dbName = env.DB_NAME ?? '';
  let dbSsl = bool(env.DB_SSL, false);

  if (env.DATABASE_URL) {
    try {
      const parsedUrl = new URL(env.DATABASE_URL);
      dbHost = parsedUrl.hostname || dbHost;
      dbPort = parsedUrl.port ? Number(parsedUrl.port) : dbPort;
      dbUser = decodeURIComponent(parsedUrl.username) || dbUser;
      dbPassword = decodeURIComponent(parsedUrl.password) || dbPassword;
      dbName = parsedUrl.pathname.replace(/^\//, '') || dbName;
      if (
        parsedUrl.searchParams.get('sslmode') === 'require' ||
        parsedUrl.searchParams.get('ssl') === 'true'
      ) {
        dbSsl = true;
      }
    } catch {
      // Fallback to individual DB_* env variables
    }
  }

  return {
    env: (env.NODE_ENV as AppConfig['env']) ?? 'development',
    port: num(env.PORT, 3000),
    trustProxy:
      trustProxy === undefined
        ? false
        : /^\d+$/.test(trustProxy)
          ? Number(trustProxy)
          : bool(trustProxy, false),
    db: {
      host: dbHost,
      port: dbPort,
      user: dbUser,
      password: dbPassword,
      name: dbName,
      ssl: dbSsl,
      sslRejectUnauthorized: bool(env.DB_SSL_REJECT_UNAUTHORIZED, false),
      poolMax: num(env.DB_POOL_MAX, 10),
      logging: bool(env.DB_LOGGING, false),
    },
    auth: {
      accessSecret: env.JWT_ACCESS_SECRET ?? '',
      accessTtlSeconds: num(env.JWT_ACCESS_TTL_SECONDS, 900),
      refreshTtlDays: num(env.REFRESH_TOKEN_TTL_DAYS, 30),
    },
    corsOrigins: (env.CORS_ORIGINS ?? 'http://localhost:5173')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
    throttle: {
      ttlMs: num(env.THROTTLE_TTL_MS, 60_000),
      limit: num(env.THROTTLE_LIMIT, 120),
      authLimit: num(env.AUTH_THROTTLE_LIMIT, 10),
    },
    cacheTtlMs: num(env.CACHE_TTL_MS, 60_000),
    uploads: {
      dir: env.UPLOAD_DIR ?? 'uploads',
      publicBaseUrl: (env.PUBLIC_BASE_URL ?? 'http://localhost:3000').replace(
        /\/$/,
        '',
      ),
      maxBytes: num(env.MAX_UPLOAD_BYTES, 5 * 1024 * 1024),
      driver: (env.STORAGE_DRIVER as 'local' | 's3') ?? 'local',
      s3: {
        endpoint: env.S3_ENDPOINT ?? '',
        region: env.S3_REGION ?? 'ap-southeast-1',
        bucket: env.S3_BUCKET ?? '',
        accessKeyId: env.S3_ACCESS_KEY_ID ?? '',
        secretAccessKey: env.S3_SECRET_ACCESS_KEY ?? '',
        publicBaseUrl: (
          env.S3_PUBLIC_BASE_URL ??
          env.PUBLIC_BASE_URL ??
          ''
        ).replace(/\/$/, ''),
        forcePathStyle: bool(env.S3_FORCE_PATH_STYLE, true),
      },
    },
    payments: {
      provider: (env.PAYMENT_PROVIDER as PaymentProviderName) ?? 'mock',
      keySecret: env.PAYMENT_KEY_SECRET ?? '',
      webhookSecret: env.PAYMENT_WEBHOOK_SECRET ?? '',
    },
    shipping: {
      freeThreshold: toPaise(num(env.FREE_SHIPPING_THRESHOLD, 999)),
      standardFee: toPaise(num(env.STANDARD_SHIPPING_FEE, 49)),
      expressFee: toPaise(num(env.EXPRESS_SHIPPING_FEE, 150)),
    },
    swaggerEnabled: bool(env.SWAGGER_ENABLED, true),
    mail: {
      transport:
        (env.MAIL_TRANSPORT as MailTransportName) ??
        (env.RESEND_API_KEY ? 'resend' : 'log'),
      resendApiKey: env.RESEND_API_KEY,
      host: env.MAIL_HOST ?? 'smtp.gmail.com',
      port: num(env.MAIL_PORT, 587),
      secure: bool(env.MAIL_SECURE, false),
      user: env.MAIL_USER || null,
      password: env.MAIL_PASSWORD || null,
      from: env.MAIL_FROM || 'Bossco Naturals <onboarding@resend.dev>',
      storefrontUrl: (env.STOREFRONT_URL ?? 'http://localhost:5173').replace(
        /\/$/,
        '',
      ),
    },
    otp: {
      ttlSeconds: num(env.OTP_TTL_SECONDS, 600),
      resendSeconds: num(env.OTP_RESEND_SECONDS, 60),
      maxAttempts: num(env.OTP_MAX_ATTEMPTS, 5),
    },
  };
};
