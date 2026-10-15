import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  type Relation,
} from 'typeorm';
import { Product } from '../products/entities/product.entity.js';
import { User } from '../users/entities/user.entity.js';

@Entity('wishlist_items')
@Unique('uq_wishlist_items_user_product', ['userId', 'productId'])
export class WishlistItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'user_id',
    foreignKeyConstraintName: 'fk_wishlist_items_user',
  })
  user?: Relation<User>;

  @Column({ type: 'uuid' })
  productId: string;

  @ManyToOne(() => Product, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'product_id',
    foreignKeyConstraintName: 'fk_wishlist_items_product',
  })
  product?: Relation<Product>;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
