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
import { BaseEntity } from '../../common/entities/base.entity.js';
import { Product } from '../products/entities/product.entity.js';
import { User } from '../users/entities/user.entity.js';

@Entity('reviews')
@Unique('uq_reviews_product_user', ['productId', 'userId'])
@Index('idx_reviews_product_created', ['productId', 'createdAt'])
@Check('chk_reviews_rating', '"rating" BETWEEN 1 AND 5')
export class Review extends BaseEntity {
  @Column({ type: 'uuid' })
  productId: string;

  @ManyToOne(() => Product, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'product_id',
    foreignKeyConstraintName: 'fk_reviews_product',
  })
  product?: Relation<Product>;

  @Column({ type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id', foreignKeyConstraintName: 'fk_reviews_user' })
  user?: Relation<User>;

  @Column({ type: 'smallint' })
  rating: number;

  @Column({ type: 'varchar', length: 120 })
  title: string;

  @Column({ type: 'text' })
  content: string;

  @Column({ type: 'boolean', default: false })
  isVerifiedPurchase: boolean;

  @Column({ type: 'boolean', default: true })
  isPublished: boolean;
}
