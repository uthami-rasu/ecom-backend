import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CategoriesModule } from '../categories/categories.module.js';
import { ContactModule } from '../contact/contact.module.js';
import { CouponsModule } from '../coupons/coupons.module.js';
import { OrdersModule } from '../orders/orders.module.js';
import { ProductsModule } from '../products/products.module.js';
import { User } from '../users/entities/user.entity.js';
import { Order } from '../orders/entities/order.entity.js';
import { Address } from '../users/entities/address.entity.js';
import { AdminCategoriesController } from './controllers/admin-categories.controller.js';
import { AdminContactController } from './controllers/admin-contact.controller.js';
import { AdminCouponsController } from './controllers/admin-coupons.controller.js';
import { AdminCustomersController } from './controllers/admin-customers.controller.js';
import { AdminDashboardController } from './controllers/admin-dashboard.controller.js';
import { AdminOrdersController } from './controllers/admin-orders.controller.js';
import { AdminProductsController } from './controllers/admin-products.controller.js';
import { AdminSettingsController } from './controllers/admin-settings.controller.js';
import { CustomersService } from './customers.service.js';
import { DashboardService } from './dashboard.service.js';
import { SettingsService } from './settings.service.js';
import { StoreSetting } from './store-setting.entity.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Order, Address, StoreSetting]),
    CategoriesModule,
    ProductsModule,
    OrdersModule,
    CouponsModule,
    ContactModule,
  ],
  controllers: [
    AdminDashboardController,
    AdminCategoriesController,
    AdminProductsController,
    AdminOrdersController,
    AdminCouponsController,
    AdminContactController,
    AdminSettingsController,
    AdminCustomersController,
  ],
  providers: [DashboardService, SettingsService, CustomersService],
})
export class AdminModule {}
