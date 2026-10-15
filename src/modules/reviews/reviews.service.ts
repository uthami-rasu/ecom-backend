import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { CatalogCacheService } from '../../common/cache/catalog-cache.service.js';
import {
  offsetOf,
  paginate,
  type Paginated,
  type PaginationQueryDto,
} from '../../common/dto/pagination.dto.js';
import { Product } from '../products/entities/product.entity.js';
import type { CreateReviewDto } from './dto/review.dto.js';
import { Review } from './review.entity.js';

export interface ReviewView {
  id: string;
  rating: number;
  title: string;
  content: string;
  isVerifiedPurchase: boolean;
  author: { name: string; initials: string };
  createdAt: Date;
}

export interface ReviewSummary {
  average: number;
  count: number;
  /** Count of reviews per star value, keys "1".."5". */
  distribution: Record<'1' | '2' | '3' | '4' | '5', number>;
}

/** Only first name + last initial are exposed publicly. */
const authorOf = (review: Review) => {
  const first = review.user?.firstName?.trim() || 'Customer';
  const lastInitial = review.user?.lastName?.trim().charAt(0) ?? '';
  return {
    name: lastInitial ? `${first} ${lastInitial}.` : first,
    initials: `${first.charAt(0)}${lastInitial}`.toUpperCase(),
  };
};

const toReviewView = (review: Review): ReviewView => ({
  id: review.id,
  rating: review.rating,
  title: review.title,
  content: review.content,
  isVerifiedPurchase: review.isVerifiedPurchase,
  author: authorOf(review),
  createdAt: review.createdAt,
});

const PURCHASED_STATUSES = [
  'paid',
  'processing',
  'packed',
  'shipped',
  'out_for_delivery',
  'delivered',
];

@Injectable()
export class ReviewsService {
  constructor(
    @InjectRepository(Review) private readonly reviews: Repository<Review>,
    @InjectRepository(Product) private readonly products: Repository<Product>,
    private readonly dataSource: DataSource,
    private readonly cache: CatalogCacheService,
  ) {}

  async list(
    slug: string,
    query: PaginationQueryDto,
  ): Promise<Paginated<ReviewView> & { summary: ReviewSummary }> {
    const product = await this.findActiveProduct(slug);
    const [[rows, total], distributionRows] = await Promise.all([
      this.reviews
        .createQueryBuilder('r')
        .innerJoin('r.user', 'u')
        .select([
          'r.id',
          'r.rating',
          'r.title',
          'r.content',
          'r.isVerifiedPurchase',
          'r.createdAt',
          'u.id',
          'u.firstName',
          'u.lastName',
        ])
        .where('r.productId = :productId', { productId: product.id })
        .andWhere('r.isPublished = true')
        .orderBy('r.createdAt', 'DESC')
        .addOrderBy('r.id', 'ASC')
        .offset(offsetOf(query))
        .limit(query.limit)
        .getManyAndCount(),
      this.reviews
        .createQueryBuilder('r')
        .select('r.rating', 'rating')
        .addSelect('COUNT(*)::int', 'count')
        .where('r.productId = :productId', { productId: product.id })
        .andWhere('r.isPublished = true')
        .groupBy('r.rating')
        .getRawMany<{ rating: number; count: number }>(),
    ]);

    const distribution: ReviewSummary['distribution'] = {
      '1': 0,
      '2': 0,
      '3': 0,
      '4': 0,
      '5': 0,
    };
    for (const row of distributionRows)
      distribution[String(row.rating) as keyof typeof distribution] = row.count;

    return {
      ...paginate(rows.map(toReviewView), total, query),
      summary: {
        average: product.ratingAvg,
        count: product.reviewCount,
        distribution,
      },
    };
  }

  async create(
    userId: string,
    slug: string,
    dto: CreateReviewDto,
  ): Promise<ReviewView> {
    const product = await this.findActiveProduct(slug);

    const reviewId = await this.dataSource.transaction(async (manager) => {
      const [{ purchased }] = await manager.query(
        `SELECT EXISTS (
           SELECT 1 FROM order_items oi JOIN orders o ON o.id = oi.order_id
           WHERE o.user_id = $1 AND oi.product_id = $2 AND o.status::text = ANY($3)
         ) AS purchased`,
        [userId, product.id, PURCHASED_STATUSES],
      );
      // A duplicate review violates uq_reviews_product_user and becomes a 409.
      const review = await manager.getRepository(Review).save(
        manager.getRepository(Review).create({
          productId: product.id,
          userId,
          rating: dto.rating,
          title: dto.title,
          content: dto.content,
          isVerifiedPurchase: Boolean(purchased),
        }),
      );
      await manager.query(
        `UPDATE products SET
           rating_avg = COALESCE((SELECT ROUND(AVG(rating)::numeric, 2) FROM reviews WHERE product_id = $1 AND is_published), 0),
           review_count = (SELECT COUNT(*) FROM reviews WHERE product_id = $1 AND is_published)
         WHERE id = $1`,
        [product.id],
      );
      return review.id;
    });

    await this.cache.invalidate();
    const saved = await this.reviews.findOneOrFail({
      where: { id: reviewId },
      relations: { user: true },
    });
    return toReviewView(saved);
  }

  private async findActiveProduct(slug: string): Promise<Product> {
    const product = await this.products.findOne({
      where: { slug, isActive: true },
      select: { id: true, ratingAvg: true, reviewCount: true },
    });
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }
}
