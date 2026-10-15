import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmailOtp } from './entities/email-otp.entity.js';
import { OtpService } from './otp.service.js';

/** Shared by AuthModule (verification, password reset) and UsersModule (email change). */
@Module({
  imports: [TypeOrmModule.forFeature([EmailOtp])],
  providers: [OtpService],
  exports: [OtpService],
})
export class OtpModule {}
