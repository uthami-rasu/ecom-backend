import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  type Relation,
} from 'typeorm';
import {
  BaseEntity,
  numericTransformer,
} from '../../../common/entities/base.entity.js';
import { Category } from '../../categories/category.entity.js';
import { ProductImage } from './product-image.entity.js';
import { ProductVariant } from './product-variant.entity.js';

@Entity('products')
// Listing filters/sorts always include is_active, so it leads each composite index.
@Index('idx_products_category_price', ['isActive', 'categoryId', 'minPrice'])
@Index('idx_products_active_price', ['isActive', 'minPrice'])
@Index('idx_products_active_rating', ['isActive', 'ratingAvg'])
@Index('idx_products_active_created', ['isActive', 'createdAt'])
@Index('idx_products_featured', ['isActive', 'isFeatured'])
// Trigram GIN index for ILIKE search; created by hand in the migration.
@Index('idx_products_search_trgm', { synchronize: false })
export class Product extends BaseEntity {
  @Column({ type: 'varchar', length: 160 })
  name: string;

  @Index('uq_products_slug', { unique: true })
  @Column({ type: 'varchar', length: 180 })
  slug: string;

  @Column({ type: 'varchar', length: 300, nullable: true })
  subtitle: string | null;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  origin: string | null;

  @Column({ type: 'varchar', length: 40, nullable: true })
  badge: string | null;

  @Column({ type: 'uuid' })
  categoryId: string;

  @ManyToOne(() => Category, { onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'category_id',
    foreignKeyConstraintName: 'fk_products_category',
  })
  category?: Relation<Category>;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @Column({ type: 'boolean', default: false })
  isFeatured: boolean;

  @Column({ type: 'boolean', default: false })
  isTrending: boolean;

  /** Lowest active variant price in paise (denormalised for filtering and sorting). */
  @Column({ type: 'int', default: 0 })
  minPrice: number;

  /** Denormalised from published reviews so listings never aggregate. */
  @Column({
    type: 'numeric',
    precision: 3,
    scale: 2,
    default: 0,
    transformer: numericTransformer,
  })
  ratingAvg: number;

  @Column({ type: 'int', default: 0 })
  reviewCount: number;

  @OneToMany(() => ProductVariant, (variant) => variant.product)
  variants?: Relation<ProductVariant[]>;

  @OneToMany(() => ProductImage, (image) => image.product)
  images?: Relation<ProductImage[]>;
}
