import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  type Relation,
} from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity.js';
import { User } from './user.entity.js';

@Entity('addresses')
@Index('idx_addresses_user', ['userId'])
export class Address extends BaseEntity {
  @Column({ type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'user_id',
    foreignKeyConstraintName: 'fk_addresses_user',
  })
  user?: Relation<User>;

  @Column({ type: 'varchar', length: 40, nullable: true })
  label: string | null;

  @Column({ type: 'varchar', length: 80 })
  firstName: string;

  @Column({ type: 'varchar', length: 80 })
  lastName: string;

  @Column({ type: 'varchar', length: 20 })
  phone: string;

  @Column({ type: 'varchar', length: 200 })
  line1: string;

  @Column({ type: 'varchar', length: 200, nullable: true })
  line2: string | null;

  @Column({ type: 'varchar', length: 100 })
  city: string;

  @Column({ type: 'varchar', length: 100 })
  state: string;

  @Column({ type: 'varchar', length: 12 })
  postalCode: string;

  @Column({ type: 'char', length: 2, default: 'IN' })
  country: string;

  @Column({ type: 'boolean', default: false })
  isDefaultShipping: boolean;

  @Column({ type: 'boolean', default: false })
  isDefaultBilling: boolean;
}
