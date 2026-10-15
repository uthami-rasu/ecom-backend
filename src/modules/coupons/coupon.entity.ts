import { Check, Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity.js';

export enum CouponType {
  Percentage = 'percentage',
  Fixed = 'fixed',
}

@Entity('coupons')
@Check('chk_coupons_used_count', '"used_count" >= 0')
export class Coupon extends BaseEntity {
  /** Stored upper-case; lookups are case-insensitive. */
  @Index('uq_coupons_code', { unique: true })
  @Column({ type: 'varchar', length: 40 })
  code: string;

  @Column({ type: 'varchar', length: 200, nullable: true })
  description: string | null;

  @Column({ type: 'enum', enum: CouponType, enumName: 'coupon_type' })
  type: CouponType;

  /** Percent (1-100) for percentage coupons, paise for fixed coupons. */
  @Column({ type: 'int' })
  value: number;

  /** Paise. */
  @Column({ type: 'int', default: 0 })
  minSubtotal: number;

  /** Paise cap for percentage coupons. */
  @Column({ type: 'int', nullable: true })
  maxDiscount: number | null;

  @Column({ type: 'timestamptz', nullable: true })
  startsAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  expiresAt: Date | null;

  @Column({ type: 'int', nullable: true })
  usageLimit: number | null;

  @Column({ type: 'int', default: 0 })
  usedCount: number;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;
}
