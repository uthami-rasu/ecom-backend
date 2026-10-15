import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CategoriesModule } from '../categories/categories.module.js';
import { ProductImage } from './entities/product-image.entity.js';
import { ProductVariant } from './entities/product-variant.entity.js';
import { Product } from './entities/product.entity.js';
import { ProductsAdminService } from './products-admin.service.js';
import { ProductsController } from './products.controller.js';
import { ProductsService } from './products.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([Product, ProductVariant, ProductImage]),
    CategoriesModule,
  ],
  controllers: [ProductsController],
  providers: [ProductsService, ProductsAdminService],
  exports: [ProductsService, ProductsAdminService],
})
export class ProductsModule {}
