import {
  Check,
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  Unique,
  type Relation,
} from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity.js';
import { ProductVariant } from '../../products/entities/product-variant.entity.js';
import { Cart } from './cart.entity.js';

@Entity('cart_items')
@Unique('uq_cart_items_cart_variant', ['cartId', 'variantId'])
@Check('chk_cart_items_quantity', '"quantity" > 0')
export class CartItem extends BaseEntity {
  @Column({ type: 'uuid' })
  cartId: string;

  @ManyToOne(() => Cart, (cart) => cart.items, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'cart_id',
    foreignKeyConstraintName: 'fk_cart_items_cart',
  })
  cart?: Relation<Cart>;

  @Column({ type: 'uuid' })
  variantId: string;

  @ManyToOne(() => ProductVariant, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'variant_id',
    foreignKeyConstraintName: 'fk_cart_items_variant',
  })
  variant?: Relation<ProductVariant>;

  @Column({ type: 'int' })
  quantity: number;
}
