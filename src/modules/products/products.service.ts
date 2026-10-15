import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository, type SelectQueryBuilder } from 'typeorm';
import { CatalogCacheService } from '../../common/cache/catalog-cache.service.js';
import {
  offsetOf,
  paginate,
  type Paginated,
} from '../../common/dto/pagination.dto.js';
import { toPaise, toRupees } from '../../common/utils/money.js';
import { escapeLike } from '../../common/utils/text.js';
import { CategoriesService } from '../categories/categories.service.js';
import type {
  ProductQueryDto,
  ProductSort,
  SuggestQueryDto,
} from './dto/product-query.dto.js';
import { ProductImage } from './entities/product-image.entity.js';
import { ProductVariant } from './entities/product-variant.entity.js';
import { Product } from './entities/product.entity.js';
import {
  toImageView,
  toProductSummary,
  toVariantView,
  type ProductDetail,
  type ProductSummary,
} from './product.mapper.js';

/** Must match the expression of the trigram index created in the ProductSearchIndex migration. */
export const SEARCH_EXPRESSION = `(p.name || ' ' || coalesce(p.subtitle, '') || ' ' || coalesce(p.origin, ''))`;

const SUMMARY_COLUMNS = [
  'p.id',
  'p.slug',
  'p.name',
  'p.subtitle',
  'p.origin',
  'p.badge',
  'p.minPrice',
  'p.ratingAvg',
  'p.reviewCount',
  'p.createdAt',
  'c.id',
  'c.name',
  'c.slug',
];

/** Sort keys are mapped to fixed columns, so user input never reaches ORDER BY. */
const SORTS: Record<ProductSort, Array<[string, 'ASC' | 'DESC']>> = {
  featured: [
    ['p.isFeatured', 'DESC'],
    ['p.reviewCount', 'DESC'],
    ['p.createdAt', 'DESC'],
  ],
  newest: [['p.createdAt', 'DESC']],
  'price-low': [['p.minPrice', 'ASC']],
  'price-high': [['p.minPrice', 'DESC']],
  rating: [
    ['p.ratingAvg', 'DESC'],
    ['p.reviewCount', 'DESC'],
  ],
};

export interface SuggestItem {
  id: string;
  slug: string;
  name: string;
  category: string;
  price: number;
  thumbUrl: string | null;
}

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Product) private readonly products: Repository<Product>,
    @InjectRepository(ProductVariant)
    private readonly variants: Repository<ProductVariant>,
    @InjectRepository(ProductImage)
    private readonly images: Repository<ProductImage>,
    private readonly categories: CategoriesService,
    private readonly cache: CatalogCacheService,
  ) {}

  list(query: ProductQueryDto): Promise<Paginated<ProductSummary>> {
    return this.cache.getOrSet(
      `products:list:${JSON.stringify(query)}`,
      async () => {
        const qb = this.publicBaseQuery();

        if (query.category) {
          const categoryIds = await this.categories
            .resolveIdsForSlug(query.category)
            .catch(() => null);
          if (!categoryIds) return paginate([], 0, query);
          qb.andWhere('p.categoryId IN (:...categoryIds)', { categoryIds });
        }
        if (query.search) {
          qb.andWhere(`${SEARCH_EXPRESSION} ILIKE :search`, {
            search: `%${escapeLike(query.search)}%`,
          });
        }
        if (query.minPrice !== undefined)
          qb.andWhere('p.minPrice >= :minPrice', {
            minPrice: toPaise(query.minPrice),
          });
        if (query.maxPrice !== undefined)
          qb.andWhere('p.minPrice <= :maxPrice', {
            maxPrice: toPaise(query.maxPrice),
          });
        if (query.minRating !== undefined)
          qb.andWhere('p.ratingAvg >= :minRating', {
            minRating: query.minRating,
          });
        if (query.featured !== undefined)
          qb.andWhere('p.isFeatured = :featured', { featured: query.featured });
        if (query.trending !== undefined)
          qb.andWhere('p.isTrending = :trending', { trending: query.trending });
        if (query.sizes?.length) {
          qb.andWhere(
            'EXISTS (SELECT 1 FROM product_variants v WHERE v.product_id = p.id AND v.is_active = true AND v.label IN (:...sizes))',
            { sizes: query.sizes },
          );
        }
        if (query.inStock) {
          qb.andWhere(
            'EXISTS (SELECT 1 FROM product_variants v WHERE v.product_id = p.id AND v.is_active = true AND v.stock > 0)',
          );
        }

        for (const [index, [column, direction]] of SORTS[
          query.sort
        ].entries()) {
          if (index === 0) qb.orderBy(column, direction);
          else qb.addOrderBy(column, direction);
        }
        qb.addOrderBy('p.id', 'ASC'); // deterministic pagination

        // Only many-to-one joins, so OFFSET/LIMIT can be applied directly without row duplication.
        const [rows, total] = await qb
          .offset(offsetOf(query))
          .limit(query.limit)
          .getManyAndCount();
        return paginate(await this.toSummaries(rows), total, query);
      },
    );
  }

  suggest(query: SuggestQueryDto): Promise<SuggestItem[]> {
    return this.cache.getOrSet(
      `products:suggest:${query.q.toLowerCase()}:${query.limit}`,
      async () => {
        const rows = await this.publicBaseQuery()
          .andWhere(`${SEARCH_EXPRESSION} ILIKE :search`, {
            search: `%${escapeLike(query.q)}%`,
          })
          .orderBy('p.isFeatured', 'DESC')
          .addOrderBy('p.reviewCount', 'DESC')
          .addOrderBy('p.id', 'ASC')
          .limit(query.limit)
          .getMany();
        const images = await this.primaryImages(rows.map((row) => row.id));
        return rows.map((row) => ({
          id: row.id,
          slug: row.slug,
          name: row.name,
          category: row.category!.name,
          price: toRupees(row.minPrice),
          thumbUrl: images.get(row.id)?.thumbUrl ?? null,
        }));
      },
    );
  }

  /** Product detail in a fixed number of indexed queries, cached until the next catalog write. */
  getBySlug(slug: string): Promise<ProductDetail> {
    return this.cache.getOrSet(`products:detail:${slug}`, async () => {
      const product = await this.publicBaseQuery()
        .addSelect('p.description')
        .addSelect('p.categoryId')
        .andWhere('p.slug = :slug', { slug })
        .getOne();
      if (!product) throw new NotFoundException('Product not found');

      const [variants, images, similarRows] = await Promise.all([
        this.activeVariants([product.id]),
        this.images.find({
          where: { productId: product.id },
          order: { sortOrder: 'ASC', createdAt: 'ASC' },
        }),
        this.publicBaseQuery()
          .andWhere('p.categoryId = :categoryId', {
            categoryId: product.categoryId,
          })
          .andWhere('p.id <> :id', { id: product.id })
          .orderBy('p.isFeatured', 'DESC')
          .addOrderBy('p.ratingAvg', 'DESC')
          .addOrderBy('p.id', 'ASC')
          .limit(4)
          .getMany(),
      ]);

      const productVariants = variants.get(product.id) ?? [];
      return {
        ...toProductSummary(product, productVariants, images[0]),
        description: product.description,
        images: images.map(toImageView),
        variants: productVariants.map(toVariantView),
        similar: await this.toSummaries(similarRows),
      };
    });
  }

  /** Hydrates product rows with variants and primary image using two batched queries (no N+1). */
  async toSummaries(rows: Product[]): Promise<ProductSummary[]> {
    if (!rows.length) return [];
    const ids = rows.map((row) => row.id);
    const [variants, images] = await Promise.all([
      this.activeVariants(ids),
      this.primaryImages(ids),
    ]);
    return rows.map((row) =>
      toProductSummary(row, variants.get(row.id) ?? [], images.get(row.id)),
    );
  }

  /** Summaries for arbitrary product ids (wishlist), preserving the given order and skipping inactive products. */
  async summariesByIds(ids: string[]): Promise<ProductSummary[]> {
    if (!ids.length) return [];
    const rows = await this.publicBaseQuery()
      .andWhere('p.id IN (:...ids)', { ids })
      .getMany();
    const byId = new Map(
      (await this.toSummaries(rows)).map((summary) => [summary.id, summary]),
    );
    return ids
      .map((id) => byId.get(id))
      .filter((summary): summary is ProductSummary => Boolean(summary));
  }

  async primaryImages(
    productIds: string[],
  ): Promise<Map<string, ProductImage>> {
    if (!productIds.length) return new Map();
    const images = await this.images
      .createQueryBuilder('i')
      .distinctOn(['i.productId'])
      .where('i.productId IN (:...productIds)', { productIds })
      .orderBy('i.productId')
      .addOrderBy('i.sortOrder', 'ASC')
      .addOrderBy('i.createdAt', 'ASC')
      .getMany();
    return new Map(images.map((image) => [image.productId, image]));
  }

  private async activeVariants(
    productIds: string[],
  ): Promise<Map<string, ProductVariant[]>> {
    const variants = await this.variants.find({
      where: { productId: In(productIds), isActive: true },
      order: { sortOrder: 'ASC', price: 'ASC' },
    });
    const grouped = new Map<string, ProductVariant[]>();
    for (const variant of variants) {
      grouped.set(variant.productId, [
        ...(grouped.get(variant.productId) ?? []),
        variant,
      ]);
    }
    return grouped;
  }

  private publicBaseQuery(): SelectQueryBuilder<Product> {
    return this.products
      .createQueryBuilder('p')
      .innerJoin('p.category', 'c')
      .select(SUMMARY_COLUMNS)
      .where('p.isActive = true')
      .andWhere('c.isActive = true');
  }
}
