import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  type Relation,
} from 'typeorm';
import { User } from '../../users/entities/user.entity.js';
import { Order, OrderStatus } from './order.entity.js';

export enum OrderEventActor {
  System = 'system',
  Customer = 'customer',
  Admin = 'admin',
}

/**
 * Append-only order timeline shown to customers and admins. `status` is the status the
 * order moved to, or null for notes and tracking updates.
 */
@Entity('order_events')
@Index('idx_order_events_order_created', ['orderId', 'createdAt'])
export class OrderEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  orderId: string;

  @ManyToOne(() => Order, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'order_id',
    foreignKeyConstraintName: 'fk_order_events_order',
  })
  order?: Relation<Order>;

  @Column({
    type: 'enum',
    enum: OrderStatus,
    enumName: 'order_status',
    nullable: true,
  })
  status: OrderStatus | null;

  @Column({ type: 'varchar', length: 120 })
  title: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  note: string | null;

  @Column({
    type: 'enum',
    enum: OrderEventActor,
    enumName: 'order_event_actor',
  })
  actor: OrderEventActor;

  @Column({ type: 'uuid', nullable: true })
  actorUserId: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({
    name: 'actor_user_id',
    foreignKeyConstraintName: 'fk_order_events_actor_user',
  })
  actorUser?: Relation<User> | null;

  /** clock_timestamp() (not now()) keeps events written in one transaction in order. */
  @CreateDateColumn({ type: 'timestamptz', default: () => 'clock_timestamp()' })
  createdAt: Date;
}
