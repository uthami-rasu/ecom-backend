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

export enum OtpPurpose {
  VerifyEmail = 'verify_email',
  ResetPassword = 'reset_password',
  ChangeEmail = 'change_email',
}

/**
 * One-time email codes. Only an HMAC of the code is stored; issuing a new code for the
 * same user and purpose invalidates the older ones, and a code is burnt after too many
 * wrong guesses.
 */
@Entity('email_otps')
@Index('idx_email_otps_user_purpose_created', [
  'userId',
  'purpose',
  'createdAt',
])
export class EmailOtp {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'user_id',
    foreignKeyConstraintName: 'fk_email_otps_user',
  })
  user?: Relation<User>;

  /** Address the code was sent to (the new address for email changes). */
  @Column({ type: 'varchar', length: 254 })
  email: string;

  @Column({ type: 'enum', enum: OtpPurpose, enumName: 'otp_purpose' })
  purpose: OtpPurpose;

  @Column({ type: 'varchar', length: 64 })
  codeHash: string;

  @Column({ type: 'int', default: 0 })
  attempts: number;

  @Column({ type: 'timestamptz' })
  expiresAt: Date;

  /** Set when the code is used, burnt (too many attempts) or superseded by a newer code. */
  @Column({ type: 'timestamptz', nullable: true })
  consumedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
