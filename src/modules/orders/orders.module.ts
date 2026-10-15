import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CouponsModule } from '../coupons/coupons.module.js';
import { Payment } from '../payments/payment.entity.js';
import { ProductsModule } from '../products/products.module.js';
import { User } from '../users/entities/user.entity.js';
import { UsersModule } from '../users/users.module.js';
import { OrderEvent } from './entities/order-event.entity.js';
import { OrderItem } from './entities/order-item.entity.js';
import { Order } from './entities/order.entity.js';
import { OrderNotifier } from './order-notifier.service.js';
import { OrdersController } from './orders.controller.js';
import { OrdersService } from './orders.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([Order, OrderItem, OrderEvent, Payment, User]),
    CouponsModule,
    ProductsModule,
    UsersModule,
  ],
  controllers: [OrdersController],
  providers: [OrdersService, OrderNotifier],
  exports: [OrdersService],
})
export class OrdersModule {}
