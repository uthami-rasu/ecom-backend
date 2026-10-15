import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Coupon } from './coupon.entity.js';
import { CouponsService } from './coupons.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([Coupon])],
  providers: [CouponsService],
  exports: [CouponsService],
})
export class CouponsModule {}
