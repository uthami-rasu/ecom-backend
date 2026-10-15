import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export const CONTACT_SUBJECTS = [
  'Product enquiry',
  'Order support',
  'Wholesale enquiry',
  'Gifting and hampers',
  'Something else',
] as const;

@Entity('contact_messages')
@Index('idx_contact_messages_created', ['createdAt'])
export class ContactMessage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 120 })
  fullName: string;

  @Column({ type: 'varchar', length: 254 })
  email: string;

  @Column({ type: 'varchar', length: 20 })
  phone: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  orderNumber: string | null;

  @Column({ type: 'varchar', length: 40 })
  subject: string;

  @Column({ type: 'text' })
  message: string;

  @Column({ type: 'boolean', default: false })
  isResolved: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
