import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity.js';
import { Role } from '../../../common/enums/role.enum.js';

@Entity('users')
export class User extends BaseEntity {
  /** Always stored lower-cased. */
  @Index('uq_users_email', { unique: true })
  @Column({ type: 'varchar', length: 254 })
  email: string;

  @Column({ type: 'varchar', length: 255, select: false })
  passwordHash: string;

  @Column({ type: 'varchar', length: 80 })
  firstName: string;

  @Column({ type: 'varchar', length: 80 })
  lastName: string;

  @Column({ type: 'varchar', length: 80, nullable: true })
  displayName: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  phone: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  avatarUrl: string | null;

  @Column({
    type: 'enum',
    enum: Role,
    enumName: 'user_role',
    default: Role.Customer,
  })
  role: Role;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  /** Null until the customer confirms the email OTP; unverified accounts cannot log in. */
  @Column({ type: 'timestamptz', nullable: true })
  emailVerifiedAt: Date | null;
}
