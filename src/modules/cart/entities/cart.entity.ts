import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  type Relation,
} from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity.js';
import { User } from '../../users/entities/user.entity.js';
import { CartItem } from './cart-item.entity.js';

@Entity('carts')
export class Cart extends BaseEntity {
  @Index('uq_carts_user', { unique: true })
  @Column({ type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id', foreignKeyConstraintName: 'fk_carts_user' })
  user?: Relation<User>;

  /** Re-validated every time totals are computed. */
  @Column({ type: 'varchar', length: 40, nullable: true })
  couponCode: string | null;

  @OneToMany(() => CartItem, (item) => item.cart)
  items?: Relation<CartItem[]>;
}
