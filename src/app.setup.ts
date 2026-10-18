import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpAdapterHost } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import compression from 'compression';
import helmet from 'helmet';
import { resolve } from 'node:path';
import { DatabaseExceptionFilter } from './common/filters/database-exception.filter.js';
import { HttpErrorFilter } from './common/filters/http-error.filter.js';
import type { AppConfig } from './config/configuration.js';

export const API_PREFIX = 'api/v1';

/** Shared by main.ts and the e2e tests so both run the exact same HTTP pipeline. */
export function configureApp(app: NestExpressApplication): INestApplication {
  const config = app.get<ConfigService<AppConfig, true>>(ConfigService);

  app.set('trust proxy', config.get('trustProxy', { infer: true }));
  app.disable('x-powered-by');

  app.use(
    helmet({
      // Product images are loaded cross-origin by the storefront.
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );
  app.use(compression({ threshold: 1024 }));
  app.useBodyParser('json', { limit: '100kb' });
  app.useBodyParser('urlencoded', { limit: '100kb', extended: false });

  const rawOrigins = config.get('corsOrigins', { infer: true }) ?? [];
  const allowedOrigins = new Set(
    rawOrigins.map((o: string) => o.trim().replace(/\/$/, '')),
  );

  app.enableCors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      const cleanOrigin = origin.replace(/\/$/, '');
      const isAllowed =
        allowedOrigins.has('*') ||
        allowedOrigins.has(cleanOrigin) ||
        /^https?:\/\/([a-z0-9-]+\.)*bosscodryfruits\.com$/i.test(cleanOrigin) ||
        /^https?:\/\/([a-z0-9-]+\.)*vercel\.app$/i.test(cleanOrigin) ||
        /^https?:\/\/localhost(:[0-9]+)?$/i.test(cleanOrigin) ||
        /^https?:\/\/127\.0\.0\.1(:[0-9]+)?$/i.test(cleanOrigin);

      callback(null, isAllowed);
    },
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Authorization',
      'Content-Type',
      'Accept',
      'Origin',
      'X-Requested-With',
    ],
    credentials: true,
    maxAge: 86400,
  });

  app.setGlobalPrefix(API_PREFIX);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true, // unknown fields (e.g. "role", "price") are rejected, not silently dropped
      transform: true,
      transformOptions: { enableImplicitConversion: false },
      validationError: { target: false, value: false },
    }),
  );
  // Filters are matched last-registered-first, so the specific database filter wins.
  app.useGlobalFilters(
    new HttpErrorFilter(app.get(HttpAdapterHost).httpAdapter),
    new DatabaseExceptionFilter(),
  );

  app.useStaticAssets(resolve(config.get('uploads.dir', { infer: true })), {
    prefix: '/uploads/',
    maxAge: '30d',
    immutable: true, // file names are random UUIDs and never reused
    index: false,
    dotfiles: 'deny',
  });

  if (config.get('swaggerEnabled', { infer: true })) {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('Bossco Naturals Commerce API')
        .setDescription(
          'REST API for the storefront and admin panel. Amounts are in INR rupees. ' +
            'Authenticate with the access token from /auth/login (Bearer).',
        )
        .setVersion('1.0.0')
        .addBearerAuth()
        .build(),
    );
    SwaggerModule.setup('api/docs', app, document, {
      jsonDocumentUrl: 'api/docs-json',
    });
  }

  app.enableShutdownHooks();
  return app;
}
