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

/**
 * Opaque refresh tokens are stored only as SHA-256 hashes. Tokens rotate on every use;
 * all tokens issued from one login share a `familyId` so that re-use of an already
 * rotated token (a sign of theft) revokes the whole family.
 */
@Entity('refresh_tokens')
@Index('idx_refresh_tokens_user', ['userId'])
@Index('idx_refresh_tokens_family', ['familyId'])
export class RefreshToken {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'user_id',
    foreignKeyConstraintName: 'fk_refresh_tokens_user',
  })
  user?: Relation<User>;

  @Index('uq_refresh_tokens_hash', { unique: true })
  @Column({ type: 'char', length: 64 })
  tokenHash: string;

  @Column({ type: 'uuid' })
  familyId: string;

  @Column({ type: 'timestamptz' })
  expiresAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  revokedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
