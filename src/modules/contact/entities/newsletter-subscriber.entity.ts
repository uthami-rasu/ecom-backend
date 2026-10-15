import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('newsletter_subscribers')
export class NewsletterSubscriber {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index('uq_newsletter_subscribers_email', { unique: true })
  @Column({ type: 'varchar', length: 254 })
  email: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
