import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CouponsModule } from '../coupons/coupons.module.js';
import { ProductVariant } from '../products/entities/product-variant.entity.js';
import { ProductsModule } from '../products/products.module.js';
import { CartController } from './cart.controller.js';
import { CartService } from './cart.service.js';
import { CartItem } from './entities/cart-item.entity.js';
import { Cart } from './entities/cart.entity.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([Cart, CartItem, ProductVariant]),
    CouponsModule,
    ProductsModule,
  ],
  controllers: [CartController],
  providers: [CartService],
  exports: [CartService],
})
export class CartModule {}
