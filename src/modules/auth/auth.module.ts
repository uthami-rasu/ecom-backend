import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import type { AppConfig } from '../../config/configuration.js';
import { UsersModule } from '../users/users.module.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { RefreshToken } from './entities/refresh-token.entity.js';
import { TokenService } from './token.service.js';

@Module({
  imports: [
    UsersModule,
    TypeOrmModule.forFeature([RefreshToken]),
    JwtModule.registerAsync({
      // Global so the app-wide JwtAuthGuard (registered in AppModule) can verify tokens.
      global: true,
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>) => {
        const auth = config.get('auth', { infer: true });
        return {
          secret: auth.accessSecret,
          signOptions: { algorithm: 'HS256', expiresIn: auth.accessTtlSeconds },
          verifyOptions: { algorithms: ['HS256'] },
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, TokenService],
})
export class AuthModule {}
