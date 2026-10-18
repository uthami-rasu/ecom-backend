import Joi from 'joi';

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
  PORT: Joi.number().port().default(3000),
  TRUST_PROXY: Joi.alternatives(
    Joi.boolean(),
    Joi.number().integer().min(0),
  ).default(false),

  DATABASE_URL: Joi.string()
    .uri({ scheme: [/postgres/, /postgresql/] })
    .optional(),
  DB_HOST: Joi.string().default('localhost'),
  DB_PORT: Joi.number().port().default(5432),
  DB_USER: Joi.string().allow('').optional().default(''),
  DB_PASSWORD: Joi.string().allow('').optional().default(''),
  DB_NAME: Joi.string().allow('').optional().default(''),
  DB_SSL: Joi.boolean().default(false),
  DB_SSL_REJECT_UNAUTHORIZED: Joi.boolean().default(false),
  DB_POOL_MAX: Joi.number().integer().min(1).default(10),
  DB_LOGGING: Joi.boolean().default(false),

  JWT_ACCESS_SECRET: Joi.string().min(32).required(),
  JWT_ACCESS_TTL_SECONDS: Joi.number().integer().min(60).default(900),
  REFRESH_TOKEN_TTL_DAYS: Joi.number().integer().min(1).default(30),

  CORS_ORIGINS: Joi.string().default('http://localhost:5173'),

  THROTTLE_TTL_MS: Joi.number().integer().min(1000).default(60_000),
  THROTTLE_LIMIT: Joi.number().integer().min(1).default(120),
  AUTH_THROTTLE_LIMIT: Joi.number().integer().min(1).default(10),

  CACHE_TTL_MS: Joi.number().integer().min(0).default(60_000),

  UPLOAD_DIR: Joi.string().default('uploads'),
  PUBLIC_BASE_URL: Joi.string().uri().default('http://localhost:3000'),
  MAX_UPLOAD_BYTES: Joi.number()
    .integer()
    .min(1024)
    .default(5 * 1024 * 1024),
  STORAGE_DRIVER: Joi.string().valid('local', 's3').default('local'),
  S3_ENDPOINT: Joi.string().allow('').optional(),
  S3_REGION: Joi.string().allow('').default('ap-southeast-1'),
  S3_BUCKET: Joi.string().allow('').optional(),
  S3_ACCESS_KEY_ID: Joi.string().allow('').optional(),
  S3_SECRET_ACCESS_KEY: Joi.string().allow('').optional(),
  S3_PUBLIC_BASE_URL: Joi.string().allow('').optional(),
  S3_FORCE_PATH_STYLE: Joi.boolean().default(true),

  PAYMENT_PROVIDER: Joi.string().valid('mock').default('mock'),
  PAYMENT_KEY_SECRET: Joi.string().min(16).required(),
  PAYMENT_WEBHOOK_SECRET: Joi.string().min(16).required(),

  FREE_SHIPPING_THRESHOLD: Joi.number().min(0).default(999),
  STANDARD_SHIPPING_FEE: Joi.number().min(0).default(49),
  EXPRESS_SHIPPING_FEE: Joi.number().min(0).default(150),

  SWAGGER_ENABLED: Joi.boolean().default(true),

  MAIL_TRANSPORT: Joi.string().valid('smtp', 'log', 'memory').default('log'),
  MAIL_HOST: Joi.string().hostname().default('localhost'),
  MAIL_PORT: Joi.number().port().default(1025),
  MAIL_SECURE: Joi.boolean().default(false),
  MAIL_USER: Joi.string().allow('').optional(),
  MAIL_PASSWORD: Joi.string().allow('').optional(),
  MAIL_FROM: Joi.string()
    .max(200)
    .default('Bossco Naturals <no-reply@bossco.local>'),
  STOREFRONT_URL: Joi.string().uri().default('http://localhost:5173'),

  OTP_TTL_SECONDS: Joi.number().integer().min(60).max(86_400).default(600),
  OTP_RESEND_SECONDS: Joi.number().integer().min(0).max(3600).default(60),
  OTP_MAX_ATTEMPTS: Joi.number().integer().min(1).max(20).default(5),

  ADMIN_EMAIL: Joi.string()
    .email({ tlds: { allow: false } })
    .optional(),
  ADMIN_PASSWORD: Joi.string().min(8).optional(),
});
