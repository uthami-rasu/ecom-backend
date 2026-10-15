import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import { configureApp } from './app.setup.js';
import type { AppConfig } from './config/configuration.js';

async function bootstrap() {
  // rawBody is required to verify payment webhook signatures.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
    bufferLogs: true,
  });
  configureApp(app);
  const port = app
    .get<ConfigService<AppConfig, true>>(ConfigService)
    .get('port', { infer: true });
  await app.listen(port);
  Logger.log(
    `API listening on http://localhost:${port}/api/v1 (docs: /api/docs)`,
    'Bootstrap',
  );
}
await bootstrap();
