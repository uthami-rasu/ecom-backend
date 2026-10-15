import {
  Check,
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  Unique,
  type Relation,
} from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity.js';
import { Product } from './product.entity.js';

@Entity('product_variants')
@Unique('uq_product_variants_product_label', ['productId', 'label'])
@Index('idx_product_variants_product', ['productId', 'sortOrder'])
@Check('chk_product_variants_stock', '"stock" >= 0')
@Check('chk_product_variants_price', '"price" >= 0')
export class ProductVariant extends BaseEntity {
  @Column({ type: 'uuid' })
  productId: string;

  @ManyToOne(() => Product, (product) => product.variants, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({
    name: 'product_id',
    foreignKeyConstraintName: 'fk_product_variants_product',
  })
  product?: Relation<Product>;

  /** Pack size shown to shoppers, e.g. "500g". */
  @Column({ type: 'varchar', length: 40 })
  label: string;

  @Index('uq_product_variants_sku', { unique: true })
  @Column({ type: 'varchar', length: 64 })
  sku: string;

  /** Paise. */
  @Column({ type: 'int' })
  price: number;

  /** Paise; the struck-through "was" price. */
  @Column({ type: 'int', nullable: true })
  compareAtPrice: number | null;

  @Column({ type: 'int', default: 0 })
  stock: number;

  @Column({ type: 'int', default: 0 })
  sortOrder: number;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;
}
