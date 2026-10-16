import { Column, Entity } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity.js';

/**
 * Singleton store/branding + mail configuration.
 * Everything lives in the database — no JSON file, no hardcoded brand.
 * The service always uses the row with id 'store' (upserted on first read).
 */
@Entity('store_settings')
export class StoreSetting extends BaseEntity {
  @Column({ type: 'varchar', length: 120 })
  storeName: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  storeLogoUrl: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true, select: false })
  storeLogoKey: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  faviconUrl: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true, select: false })
  faviconKey: string | null;

  @Column({ type: 'varchar', length: 254 })
  contactEmail: string;

  @Column({ type: 'varchar', length: 40 })
  phone: string;

  @Column({ type: 'text' })
  storeAddress: string;

  @Column({ type: 'varchar', length: 40 })
  taxId: string;

  @Column({ type: 'text' })
  registrationDetails: string;

  @Column({ type: 'varchar', length: 20 })
  currency: string;

  @Column({ type: 'varchar', length: 80 })
  timeZone: string;

  @Column({ type: 'numeric', precision: 12, scale: 2, default: 0 })
  standardDeliveryCharge: number;

  @Column({ type: 'numeric', precision: 12, scale: 2, default: 0 })
  freeDeliveryThreshold: number;

  @Column({ type: 'text', array: true, default: '{}' })
  deliveryRegions: string[];

  @Column({ type: 'boolean', default: true })
  enableTax: boolean;

  @Column({ type: 'numeric', precision: 5, scale: 2, default: 0 })
  defaultTaxRate: number;

  @Column({ type: 'varchar', length: 12, default: 'inclusive' })
  productPriceType: 'inclusive' | 'exclusive';

  @Column({ type: 'numeric', precision: 12, scale: 2, default: 0 })
  minOrderValue: number;

  @Column({ type: 'numeric', precision: 12, scale: 2, default: 0 })
  maxOrderValue: number;

  @Column({ type: 'boolean', default: true })
  allowCod: boolean;

  @Column({ type: 'int', default: 30 })
  cancellationWindowMinutes: number;

  @Column({ type: 'boolean', default: true })
  paymentUpi: boolean;

  @Column({ type: 'boolean', default: true })
  paymentCard: boolean;

  @Column({ type: 'boolean', default: false })
  paymentNetBanking: boolean;

  @Column({ type: 'boolean', default: true })
  paymentCod: boolean;

  /** Gmail SMTP by default (smtp.gmail.com:587, STARTTLS). Overridden via Admin Panel. */
  @Column({ type: 'varchar', length: 255, default: 'smtp.gmail.com' })
  mailHost: string;

  @Column({ type: 'int', default: 587 })
  mailPort: number;

  @Column({ type: 'varchar', length: 255, nullable: true })
  mailUser: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true, select: false })
  mailPassword: string | null;

  @Column({ type: 'varchar', length: 320 })
  mailFrom: string;

  @Column({ type: 'boolean', default: false })
  mailSecure: boolean;
}
