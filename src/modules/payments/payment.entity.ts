import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  type Relation,
} from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity.js';
import { Order } from '../orders/entities/order.entity.js';

export enum PaymentStatus {
  /** Provider order created; waiting for the customer to pay. */
  Created = 'created',
  /** Customer paid but the provider has not confirmed yet (resolved by webhook). */
  Pending = 'pending',
  Succeeded = 'succeeded',
  Failed = 'failed',
}

@Entity('payments')
@Index('idx_payments_order', ['orderId'])
export class Payment extends BaseEntity {
  @Column({ type: 'uuid' })
  orderId: string;

  @ManyToOne(() => Order, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'order_id',
    foreignKeyConstraintName: 'fk_payments_order',
  })
  order?: Relation<Order>;

  @Column({ type: 'varchar', length: 20 })
  provider: string;

  @Index('uq_payments_provider_order', { unique: true })
  @Column({ type: 'varchar', length: 100 })
  providerOrderId: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  providerPaymentId: string | null;

  /** Paise. */
  @Column({ type: 'int' })
  amount: number;

  @Column({ type: 'char', length: 3, default: 'INR' })
  currency: string;

  @Column({
    type: 'enum',
    enum: PaymentStatus,
    enumName: 'payment_status',
    default: PaymentStatus.Created,
  })
  status: PaymentStatus;

  @Column({ type: 'varchar', length: 255, nullable: true })
  failureReason: string | null;
}
