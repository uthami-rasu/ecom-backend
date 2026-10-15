import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  offsetOf,
  paginate,
  type Paginated,
  type PaginationQueryDto,
} from '../../common/dto/pagination.dto.js';
import type {
  CreateContactMessageDto,
  NewsletterDto,
} from './dto/contact.dto.js';
import { ContactMessage } from './entities/contact-message.entity.js';
import { NewsletterSubscriber } from './entities/newsletter-subscriber.entity.js';

@Injectable()
export class ContactService {
  constructor(
    @InjectRepository(ContactMessage)
    private readonly messages: Repository<ContactMessage>,
    @InjectRepository(NewsletterSubscriber)
    private readonly subscribers: Repository<NewsletterSubscriber>,
  ) {}

  async createMessage(
    dto: CreateContactMessageDto,
  ): Promise<{ received: true; reference: string }> {
    const { consent: _consent, ...fields } = dto;
    const message = await this.messages.save(
      this.messages.create({
        ...fields,
        orderNumber: fields.orderNumber?.replace(/^#/, '') ?? null,
      }),
    );
    return { received: true, reference: message.id };
  }

  /** Same response whether or not the email was already subscribed (no enumeration). */
  async subscribe(dto: NewsletterDto): Promise<{ subscribed: true }> {
    await this.subscribers
      .createQueryBuilder()
      .insert()
      .values({ email: dto.email })
      .orIgnore()
      .execute();
    return { subscribed: true };
  }

  async listMessages(
    query: PaginationQueryDto,
  ): Promise<Paginated<ContactMessage>> {
    const [rows, total] = await this.messages.findAndCount({
      order: { createdAt: 'DESC' },
      skip: offsetOf(query),
      take: query.limit,
    });
    return paginate(rows, total, query);
  }

  async resolveMessage(id: string): Promise<boolean> {
    const result = await this.messages.update({ id }, { isResolved: true });
    return Boolean(result.affected);
  }
}
