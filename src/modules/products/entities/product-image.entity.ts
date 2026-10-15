import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  type Relation,
} from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity.js';
import { Product } from './product.entity.js';

/** Each upload is stored as three WebP renditions so clients can use srcset. */
@Entity('product_images')
@Index('idx_product_images_product', ['productId', 'sortOrder'])
export class ProductImage extends BaseEntity {
  @Column({ type: 'uuid' })
  productId: string;

  @ManyToOne(() => Product, (product) => product.images, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({
    name: 'product_id',
    foreignKeyConstraintName: 'fk_product_images_product',
  })
  product?: Relation<Product>;

  /** 1200px wide. */
  @Column({ type: 'varchar', length: 500 })
  url: string;

  /** 600px wide. */
  @Column({ type: 'varchar', length: 500 })
  mediumUrl: string;

  /** 200px wide. */
  @Column({ type: 'varchar', length: 500 })
  thumbUrl: string;

  @Column({ type: 'varchar', length: 200, nullable: true })
  alt: string | null;

  @Column({ type: 'int', default: 0 })
  sortOrder: number;

  @Column({ type: 'varchar', length: 255, select: false })
  storageKey: string;
}
