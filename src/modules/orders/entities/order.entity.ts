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
import { OrderItem } from './order-item.entity.js';

export enum OrderStatus {
  PendingPayment = 'pending_payment',
  PaymentFailed = 'payment_failed',
  Paid = 'paid',
  /** Shown to customers as "Confirmed". */
  Processing = 'processing',
  Packed = 'packed',
  Shipped = 'shipped',
  OutForDelivery = 'out_for_delivery',
  Delivered = 'delivered',
  Cancelled = 'cancelled',
}

/** Snapshot of the address at the time of purchase; never changes afterwards. */
export interface OrderAddress {
  firstName: string;
  lastName: string;
  phone: string;
  line1: string;
  line2?: string | null;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}

@Entity('orders')
@Index('idx_orders_user_created', ['userId', 'createdAt'])
@Index('idx_orders_status_created', ['status', 'createdAt'])
export class Order extends BaseEntity {
  @Index('uq_orders_number', { unique: true })
  @Column({ type: 'varchar', length: 20 })
  orderNumber: string;

  @Column({ type: 'uuid', nullable: true })
  userId: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'user_id', foreignKeyConstraintName: 'fk_orders_user' })
  user?: Relation<User> | null;

  @Column({
    type: 'enum',
    enum: OrderStatus,
    enumName: 'order_status',
    default: OrderStatus.PendingPayment,
  })
  status: OrderStatus;

  /** All amounts in paise. */
  @Column({ type: 'int' })
  subtotal: number;

  @Column({ type: 'int', default: 0 })
  discount: number;

  @Column({ type: 'int', default: 0 })
  shippingFee: number;

  @Column({ type: 'int' })
  total: number;

  @Column({ type: 'char', length: 3, default: 'INR' })
  currency: string;

  @Column({ type: 'varchar', length: 40, nullable: true })
  couponCode: string | null;

  @Column({ type: 'uuid', nullable: true })
  couponId: string | null;

  @Column({ type: 'varchar', length: 20 })
  shippingMethod: string;

  @Column({ type: 'jsonb' })
  shippingAddress: OrderAddress;

  @Column({ type: 'jsonb' })
  billingAddress: OrderAddress;

  @Column({ type: 'varchar', length: 254 })
  contactEmail: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  notes: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  paidAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  cancelledAt: Date | null;

  // ── Fulfilment / tracking (set by admins) ──
  @Column({ type: 'varchar', length: 80, nullable: true })
  carrier: string | null;

  @Column({ type: 'varchar', length: 80, nullable: true })
  trackingNumber: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  trackingUrl: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  estimatedDeliveryAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  shippedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  deliveredAt: Date | null;

  @OneToMany(() => OrderItem, (item) => item.order)
  items?: Relation<OrderItem[]>;
}
