import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  type Relation,
} from 'typeorm';
import { Product } from '../../products/entities/product.entity.js';
import { ProductVariant } from '../../products/entities/product-variant.entity.js';
import { Order } from './order.entity.js';

/** Product details are copied so order history survives catalog edits and deletions. */
@Entity('order_items')
@Index('idx_order_items_order', ['orderId'])
@Index('idx_order_items_product', ['productId'])
export class OrderItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  orderId: string;

  @ManyToOne(() => Order, (order) => order.items, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'order_id',
    foreignKeyConstraintName: 'fk_order_items_order',
  })
  order?: Relation<Order>;

  @Column({ type: 'uuid', nullable: true })
  productId: string | null;

  @ManyToOne(() => Product, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({
    name: 'product_id',
    foreignKeyConstraintName: 'fk_order_items_product',
  })
  product?: Relation<Product> | null;

  @Column({ type: 'uuid', nullable: true })
  variantId: string | null;

  @ManyToOne(() => ProductVariant, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({
    name: 'variant_id',
    foreignKeyConstraintName: 'fk_order_items_variant',
  })
  variant?: Relation<ProductVariant> | null;

  @Column({ type: 'varchar', length: 160 })
  productName: string;

  @Column({ type: 'varchar', length: 180 })
  productSlug: string;

  @Column({ type: 'varchar', length: 40 })
  variantLabel: string;

  @Column({ type: 'varchar', length: 64 })
  sku: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  imageUrl: string | null;

  /** Paise. */
  @Column({ type: 'int' })
  unitPrice: number;

  @Column({ type: 'int' })
  quantity: number;

  /** Paise. */
  @Column({ type: 'int' })
  lineTotal: number;
}
