import { Module } from '@nestjs/common';
import { CategoriesModule } from '../categories/categories.module.js';
import { ContactModule } from '../contact/contact.module.js';
import { CouponsModule } from '../coupons/coupons.module.js';
import { OrdersModule } from '../orders/orders.module.js';
import { ProductsModule } from '../products/products.module.js';
import { AdminCategoriesController } from './controllers/admin-categories.controller.js';
import { AdminContactController } from './controllers/admin-contact.controller.js';
import { AdminCouponsController } from './controllers/admin-coupons.controller.js';
import { AdminDashboardController } from './controllers/admin-dashboard.controller.js';
import { AdminOrdersController } from './controllers/admin-orders.controller.js';
import { AdminProductsController } from './controllers/admin-products.controller.js';
import { DashboardService } from './dashboard.service.js';

@Module({
  imports: [
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
  ],
  providers: [DashboardService],
})
export class AdminModule {}
