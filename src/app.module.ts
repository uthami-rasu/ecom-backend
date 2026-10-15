import { CacheModule } from '@nestjs/cache-manager';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CacheableMemory } from 'cacheable';
import { Keyv } from 'keyv';
import { CommonModule } from './common/common.module.js';
import { STRICT_RATE_LIMIT_KEY } from './common/decorators/strict-rate-limit.decorator.js';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard.js';
import { RolesGuard } from './common/guards/roles.guard.js';
import configuration, { type AppConfig } from './config/configuration.js';
import { envValidationSchema } from './config/env.validation.js';
import { buildDataSourceOptions } from './database/typeorm.options.js';
import { AdminModule } from './modules/admin/admin.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { CartModule } from './modules/cart/cart.module.js';
import { CategoriesModule } from './modules/categories/categories.module.js';
import { ContactModule } from './modules/contact/contact.module.js';
import { HealthController } from './modules/health/health.controller.js';
import { MailModule } from './modules/mail/mail.module.js';
import { OrdersModule } from './modules/orders/orders.module.js';
import { PaymentsModule } from './modules/payments/payments.module.js';
import { ProductsModule } from './modules/products/products.module.js';
import { ReviewsModule } from './modules/reviews/reviews.module.js';
import { StorageModule } from './modules/storage/storage.module.js';
import { UsersModule } from './modules/users/users.module.js';
import { WishlistModule } from './modules/wishlist/wishlist.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath: process.env.NODE_ENV === 'test' ? '.env.test' : '.env',
      load: [configuration],
      validationSchema: envValidationSchema,
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>) =>
        buildDataSourceOptions(config.get('db', { infer: true })),
    }),
    CacheModule.registerAsync({
      isGlobal: true,
      inject: [ConfigService],
      // Bounded in-process LRU. For multiple instances swap in @keyv/redis here;
      // CatalogCacheService's versioned keys then invalidate across the fleet.
      useFactory: (config: ConfigService<AppConfig, true>) => ({
        stores: [
          new Keyv({
            store: new CacheableMemory({
              ttl: config.get('cacheTtlMs', { infer: true }),
              lruSize: 5000,
            }),
          }),
        ],
      }),
    }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>) => {
        const throttle = config.get('throttle', { infer: true });
        return {
          throttlers: [
            { name: 'default', ttl: throttle.ttlMs, limit: throttle.limit },
            {
              // Tighter budget for credential and form endpoints (brute force / spam).
              name: 'strict',
              ttl: throttle.ttlMs,
              limit: throttle.authLimit,
              skipIf: (context) =>
                !Reflect.getMetadata(
                  STRICT_RATE_LIMIT_KEY,
                  context.getHandler(),
                ) &&
                !Reflect.getMetadata(STRICT_RATE_LIMIT_KEY, context.getClass()),
            },
          ],
        };
      },
    }),
    CommonModule,
    MailModule,
    StorageModule,
    AuthModule,
    UsersModule,
    CategoriesModule,
    ProductsModule,
    ReviewsModule,
    WishlistModule,
    CartModule,
    OrdersModule,
    PaymentsModule,
    ContactModule,
    AdminModule,
  ],
  controllers: [HealthController],
  providers: [
    // Order matters: rate limit first, then authenticate, then authorise.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
