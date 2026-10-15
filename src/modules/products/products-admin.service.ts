import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository, type EntityManager } from 'typeorm';
import { CatalogCacheService } from '../../common/cache/catalog-cache.service.js';
import {
  offsetOf,
  paginate,
  type Paginated,
} from '../../common/dto/pagination.dto.js';
import { toPaise, toRupees, toRupeesOrNull } from '../../common/utils/money.js';
import { escapeLike, slugify } from '../../common/utils/text.js';
import { CategoriesService } from '../categories/categories.service.js';
import { ImageUploadService } from '../storage/image-upload.service.js';
import type {
  AdminProductQueryDto,
  CreateProductDto,
  CreateVariantDto,
  ImageUploadMetaDto,
  UpdateProductDto,
  UpdateVariantDto,
} from './dto/admin-product.dto.js';
import { ProductImage } from './entities/product-image.entity.js';
import { ProductVariant } from './entities/product-variant.entity.js';
import { Product } from './entities/product.entity.js';
import {
  LOW_STOCK_THRESHOLD,
  toImageView,
  type ImageView,
} from './product.mapper.js';

export const MAX_IMAGES_PER_PRODUCT = 10;

export interface AdminVariantView {
  id: string;
  label: string;
  sku: string;
  price: number;
  compareAtPrice: number | null;
  stock: number;
  sortOrder: number;
  isActive: boolean;
}

export interface AdminProductListItem {
  id: string;
  name: string;
  slug: string;
  category: { id: string; name: string };
  thumbUrl: string | null;
  price: number;
  totalStock: number;
  variantCount: number;
  stockStatus: 'in_stock' | 'low_stock' | 'out_of_stock';
  isActive: boolean;
  isFeatured: boolean;
  isTrending: boolean;
  rating: number;
  reviewCount: number;
  updatedAt: Date;
}

export interface AdminProductDetail {
  id: string;
  name: string;
  slug: string;
  subtitle: string | null;
  description: string | null;
  origin: string | null;
  badge: string | null;
  categoryId: string;
  isActive: boolean;
  isFeatured: boolean;
  isTrending: boolean;
  price: number;
  rating: number;
  reviewCount: number;
  variants: AdminVariantView[];
  images: Array<ImageView & { sortOrder: number }>;
  createdAt: Date;
  updatedAt: Date;
}

const toAdminVariant = (variant: ProductVariant): AdminVariantView => ({
  id: variant.id,
  label: variant.label,
  sku: variant.sku,
  price: toRupees(variant.price),
  compareAtPrice: toRupeesOrNull(variant.compareAtPrice),
  stock: variant.stock,
  sortOrder: variant.sortOrder,
  isActive: variant.isActive,
});

const stockStatusOf = (
  totalStock: number,
): AdminProductListItem['stockStatus'] =>
  totalStock <= 0
    ? 'out_of_stock'
    : totalStock <= LOW_STOCK_THRESHOLD
      ? 'low_stock'
      : 'in_stock';

@Injectable()
export class ProductsAdminService {
  constructor(
    @InjectRepository(Product) private readonly products: Repository<Product>,
    @InjectRepository(ProductVariant)
    private readonly variants: Repository<ProductVariant>,
    @InjectRepository(ProductImage)
    private readonly images: Repository<ProductImage>,
    private readonly dataSource: DataSource,
    private readonly categories: CategoriesService,
    private readonly imageUploads: ImageUploadService,
    private readonly cache: CatalogCacheService,
  ) {}

  async list(
    query: AdminProductQueryDto,
  ): Promise<Paginated<AdminProductListItem>> {
    const stockExpr =
      '(SELECT COALESCE(SUM(v.stock), 0) FROM product_variants v WHERE v.product_id = p.id AND v.is_active)';
    const qb = this.products
      .createQueryBuilder('p')
      .innerJoin('p.category', 'c')
      .select([
        'p.id',
        'p.name',
        'p.slug',
        'p.minPrice',
        'p.isActive',
        'p.isFeatured',
        'p.isTrending',
        'p.ratingAvg',
        'p.reviewCount',
        'p.updatedAt',
        'p.createdAt',
        'c.id',
        'c.name',
      ])
      .addSelect(stockExpr, 'total_stock')
      .addSelect(
        '(SELECT COUNT(*) FROM product_variants v WHERE v.product_id = p.id)',
        'variant_count',
      );

    if (query.search) {
      qb.andWhere(
        '(p.name ILIKE :search OR p.slug ILIKE :search OR EXISTS (SELECT 1 FROM product_variants v WHERE v.product_id = p.id AND v.sku ILIKE :search))',
        { search: `%${escapeLike(query.search)}%` },
      );
    }
    if (query.categoryId)
      qb.andWhere('p.categoryId = :categoryId', {
        categoryId: query.categoryId,
      });
    if (query.isActive !== undefined)
      qb.andWhere('p.isActive = :isActive', { isActive: query.isActive });
    if (query.stockStatus === 'out_of_stock') qb.andWhere(`${stockExpr} = 0`);
    if (query.stockStatus === 'low_stock')
      qb.andWhere(`${stockExpr} BETWEEN 1 AND :low`, {
        low: LOW_STOCK_THRESHOLD,
      });
    if (query.stockStatus === 'in_stock')
      qb.andWhere(`${stockExpr} > :low`, { low: LOW_STOCK_THRESHOLD });

    const orderings: Record<
      AdminProductQueryDto['sort'],
      [string, 'ASC' | 'DESC']
    > = {
      newest: ['p.createdAt', 'DESC'],
      name: ['p.name', 'ASC'],
      'price-low': ['p.minPrice', 'ASC'],
      'price-high': ['p.minPrice', 'DESC'],
      'stock-low': ['total_stock', 'ASC'],
    };
    const [column, direction] = orderings[query.sort];
    qb.orderBy(column, direction).addOrderBy('p.id', 'ASC');

    const total = await qb.getCount();
    const { entities, raw } = await qb
      .offset(offsetOf(query))
      .limit(query.limit)
      .getRawAndEntities();
    const stats = new Map(
      raw.map(
        (row: { p_id: string; total_stock: string; variant_count: string }) => [
          row.p_id,
          {
            totalStock: Number(row.total_stock),
            variantCount: Number(row.variant_count),
          },
        ],
      ),
    );
    const thumbs = await this.primaryThumbs(
      entities.map((product) => product.id),
    );

    return paginate(
      entities.map((product) => {
        const { totalStock, variantCount } = stats.get(product.id) ?? {
          totalStock: 0,
          variantCount: 0,
        };
        return {
          id: product.id,
          name: product.name,
          slug: product.slug,
          category: { id: product.category!.id, name: product.category!.name },
          thumbUrl: thumbs.get(product.id) ?? null,
          price: toRupees(product.minPrice),
          totalStock,
          variantCount,
          stockStatus: stockStatusOf(totalStock),
          isActive: product.isActive,
          isFeatured: product.isFeatured,
          isTrending: product.isTrending,
          rating: product.ratingAvg,
          reviewCount: product.reviewCount,
          updatedAt: product.updatedAt,
        };
      }),
      total,
      query,
    );
  }

  async get(id: string): Promise<AdminProductDetail> {
    const product = await this.products.findOneBy({ id });
    if (!product) throw new NotFoundException('Product not found');
    const [variants, images] = await Promise.all([
      this.variants.find({
        where: { productId: id },
        order: { sortOrder: 'ASC', price: 'ASC' },
      }),
      this.images.find({
        where: { productId: id },
        order: { sortOrder: 'ASC', createdAt: 'ASC' },
      }),
    ]);
    return {
      id: product.id,
      name: product.name,
      slug: product.slug,
      subtitle: product.subtitle,
      description: product.description,
      origin: product.origin,
      badge: product.badge,
      categoryId: product.categoryId,
      isActive: product.isActive,
      isFeatured: product.isFeatured,
      isTrending: product.isTrending,
      price: toRupees(product.minPrice),
      rating: product.ratingAvg,
      reviewCount: product.reviewCount,
      variants: variants.map(toAdminVariant),
      images: images.map((image) => ({
        ...toImageView(image),
        sortOrder: image.sortOrder,
      })),
      createdAt: product.createdAt,
      updatedAt: product.updatedAt,
    };
  }

  async create(dto: CreateProductDto): Promise<AdminProductDetail> {
    const slug = dto.slug ?? slugify(dto.name);
    if (!slug)
      throw new BadRequestException(
        'Could not derive a slug from the name; provide one explicitly',
      );
    await this.assertCategory(dto.categoryId);
    this.assertUniqueLabels(dto.variants.map((variant) => variant.label));

    const id = await this.dataSource.transaction(async (manager) => {
      const { variants, ...fields } = dto;
      const product = await manager.getRepository(Product).save(
        manager.getRepository(Product).create({
          ...fields,
          slug,
          subtitle: fields.subtitle ?? null,
          description: fields.description ?? null,
          origin: fields.origin ?? null,
          badge: fields.badge ?? null,
        }),
      );
      await manager
        .getRepository(ProductVariant)
        .save(
          variants.map((variant, index) =>
            this.buildVariant(manager, product, variant, index),
          ),
        );
      await this.recalculatePricing(manager, product.id);
      return product.id;
    });
    await this.cache.invalidate();
    return this.get(id);
  }

  async update(id: string, dto: UpdateProductDto): Promise<AdminProductDetail> {
    const product = await this.products.findOneBy({ id });
    if (!product) throw new NotFoundException('Product not found');
    if (dto.categoryId && dto.categoryId !== product.categoryId)
      await this.assertCategory(dto.categoryId);

    Object.assign(product, dto);
    await this.products.save(product);
    await this.cache.invalidate();
    return this.get(id);
  }

  /** Order history keeps its snapshot; carts, wishlists and reviews cascade. */
  async remove(id: string): Promise<void> {
    const images = await this.images.find({
      where: { productId: id },
      select: { id: true, storageKey: true },
    });
    const result = await this.products.delete({ id });
    if (!result.affected) throw new NotFoundException('Product not found');
    await Promise.all(
      images.map((image) => this.imageUploads.remove(image.storageKey)),
    );
    await this.cache.invalidate();
  }

  // ── Variants ───────────────────────────────────────────

  async addVariant(
    productId: string,
    dto: CreateVariantDto,
  ): Promise<AdminVariantView> {
    const product = await this.products.findOneBy({ id: productId });
    if (!product) throw new NotFoundException('Product not found');

    const variant = await this.dataSource.transaction(async (manager) => {
      const count = await manager
        .getRepository(ProductVariant)
        .countBy({ productId });
      const saved = await manager
        .getRepository(ProductVariant)
        .save(this.buildVariant(manager, product, dto, count));
      await this.recalculatePricing(manager, productId);
      return saved;
    });
    await this.cache.invalidate();
    return toAdminVariant(variant);
  }

  async updateVariant(
    productId: string,
    variantId: string,
    dto: UpdateVariantDto,
  ): Promise<AdminVariantView> {
    const variant = await this.variants.findOneBy({ id: variantId, productId });
    if (!variant) throw new NotFoundException('Variant not found');

    const compareAt =
      dto.compareAtPrice === undefined
        ? variant.compareAtPrice
        : dto.compareAtPrice === null
          ? null
          : toPaise(dto.compareAtPrice);
    const price = dto.price === undefined ? variant.price : toPaise(dto.price);
    this.assertCompareAt(price, compareAt);

    Object.assign(variant, {
      ...(dto.label !== undefined && { label: dto.label }),
      ...(dto.sku !== undefined && { sku: dto.sku }),
      ...(dto.stock !== undefined && { stock: dto.stock }),
      ...(dto.sortOrder !== undefined && { sortOrder: dto.sortOrder }),
      ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      price,
      compareAtPrice: compareAt,
    });

    const saved = await this.dataSource.transaction(async (manager) => {
      const result = await manager.getRepository(ProductVariant).save(variant);
      await this.recalculatePricing(manager, productId);
      return result;
    });
    await this.cache.invalidate();
    return toAdminVariant(saved);
  }

  async removeVariant(productId: string, variantId: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(ProductVariant);
      if (!(await repo.existsBy({ id: variantId, productId })))
        throw new NotFoundException('Variant not found');
      if ((await repo.countBy({ productId })) <= 1) {
        throw new BadRequestException(
          'A product must keep at least one variant; deactivate the product instead',
        );
      }
      await repo.delete({ id: variantId, productId });
      await this.recalculatePricing(manager, productId);
    });
    await this.cache.invalidate();
  }

  // ── Images ─────────────────────────────────────────────

  async addImage(
    productId: string,
    file: Express.Multer.File | undefined,
    meta: ImageUploadMetaDto,
  ) {
    if (!(await this.products.existsBy({ id: productId })))
      throw new NotFoundException('Product not found');
    if ((await this.images.countBy({ productId })) >= MAX_IMAGES_PER_PRODUCT) {
      throw new BadRequestException(
        `A product can have at most ${MAX_IMAGES_PER_PRODUCT} images`,
      );
    }
    const stored = await this.imageUploads.upload('products', file);
    const image = await this.images.save(
      this.images.create({
        productId,
        ...stored,
        alt: meta.alt ?? null,
        sortOrder: meta.sortOrder ?? 0,
      }),
    );
    await this.cache.invalidate();
    return { ...toImageView(image), sortOrder: image.sortOrder };
  }

  async removeImage(productId: string, imageId: string): Promise<void> {
    const image = await this.images.findOne({
      where: { id: imageId, productId },
      select: { id: true, storageKey: true },
    });
    if (!image) throw new NotFoundException('Image not found');
    await this.images.delete({ id: imageId });
    await this.imageUploads.remove(image.storageKey);
    await this.cache.invalidate();
  }

  // ── Helpers ────────────────────────────────────────────

  /** Keeps products.min_price in sync with the cheapest active variant. */
  async recalculatePricing(
    manager: EntityManager,
    productId: string,
  ): Promise<void> {
    await manager.query(
      `UPDATE products SET min_price = COALESCE(
         (SELECT MIN(price) FROM product_variants WHERE product_id = $1 AND is_active),
         (SELECT MIN(price) FROM product_variants WHERE product_id = $1), 0)
       WHERE id = $1`,
      [productId],
    );
  }

  private buildVariant(
    manager: EntityManager,
    product: Product,
    dto: CreateVariantDto,
    index: number,
  ): ProductVariant {
    const price = toPaise(dto.price);
    const compareAt =
      dto.compareAtPrice === undefined || dto.compareAtPrice === null
        ? null
        : toPaise(dto.compareAtPrice);
    this.assertCompareAt(price, compareAt);
    return manager.getRepository(ProductVariant).create({
      productId: product.id,
      label: dto.label,
      sku: dto.sku ?? this.generateSku(product.slug, dto.label),
      price,
      compareAtPrice: compareAt,
      stock: dto.stock,
      sortOrder: dto.sortOrder ?? index,
      isActive: dto.isActive ?? true,
    });
  }

  private generateSku(slug: string, label: string): string {
    const base = slug
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '-')
      .slice(0, 40);
    const size = label
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '')
      .slice(0, 12);
    return `${base}-${size}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`.replace(
      /-+/g,
      '-',
    );
  }

  private assertCompareAt(price: number, compareAt: number | null): void {
    if (compareAt !== null && compareAt <= price) {
      throw new BadRequestException(
        'compareAtPrice must be greater than price',
      );
    }
  }

  private assertUniqueLabels(labels: string[]): void {
    const normalised = labels.map((label) => label.toLowerCase());
    if (new Set(normalised).size !== normalised.length)
      throw new BadRequestException('Variant labels must be unique');
  }

  private async assertCategory(categoryId: string): Promise<void> {
    if (!(await this.categories.exists(categoryId)))
      throw new BadRequestException('Category does not exist');
  }

  private async primaryThumbs(
    productIds: string[],
  ): Promise<Map<string, string>> {
    if (!productIds.length) return new Map();
    const images = await this.images
      .createQueryBuilder('i')
      .distinctOn(['i.productId'])
      .where('i.productId IN (:...productIds)', { productIds })
      .orderBy('i.productId')
      .addOrderBy('i.sortOrder', 'ASC')
      .getMany();
    return new Map(images.map((image) => [image.productId, image.thumbUrl]));
  }
}
