import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OtpModule } from '../otp/otp.module.js';
import { AddressesService } from './addresses.service.js';
import { Address } from './entities/address.entity.js';
import { User } from './entities/user.entity.js';
import { UsersController } from './users.controller.js';
import { UsersService } from './users.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([User, Address]), OtpModule],
  controllers: [UsersController],
  providers: [UsersService, AddressesService],
  exports: [UsersService, AddressesService, OtpModule],
})
export class UsersModule {}
