import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Product } from '../products/entities/product.entity.js';
import type { ProductSummary } from '../products/product.mapper.js';
import { ProductsService } from '../products/products.service.js';
import { WishlistItem } from './wishlist-item.entity.js';

const MAX_WISHLIST_ITEMS = 200;

@Injectable()
export class WishlistService {
  constructor(
    @InjectRepository(WishlistItem)
    private readonly items: Repository<WishlistItem>,
    @InjectRepository(Product) private readonly products: Repository<Product>,
    private readonly productsService: ProductsService,
  ) {}

  async list(userId: string): Promise<ProductSummary[]> {
    const items = await this.items.find({
      where: { userId },
      select: { productId: true },
      order: { createdAt: 'DESC' },
      take: MAX_WISHLIST_ITEMS,
    });
    return this.productsService.summariesByIds(
      items.map((item) => item.productId),
    );
  }

  /** Idempotent: adding an already-saved product is a no-op. */
  async add(
    userId: string,
    productId: string,
  ): Promise<{ productId: string; saved: true }> {
    if (!(await this.products.existsBy({ id: productId, isActive: true }))) {
      throw new NotFoundException('Product not found');
    }
    if ((await this.items.countBy({ userId })) >= MAX_WISHLIST_ITEMS) {
      throw new BadRequestException(
        `A wishlist can hold at most ${MAX_WISHLIST_ITEMS} products`,
      );
    }
    await this.items
      .createQueryBuilder()
      .insert()
      .values({ userId, productId })
      .orIgnore()
      .execute();
    return { productId, saved: true };
  }

  async remove(userId: string, productId: string): Promise<void> {
    await this.items.delete({ userId, productId });
  }
}
