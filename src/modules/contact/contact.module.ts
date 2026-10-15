import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ContactController } from './contact.controller.js';
import { ContactService } from './contact.service.js';
import { ContactMessage } from './entities/contact-message.entity.js';
import { NewsletterSubscriber } from './entities/newsletter-subscriber.entity.js';

@Module({
  imports: [TypeOrmModule.forFeature([ContactMessage, NewsletterSubscriber])],
  controllers: [ContactController],
  providers: [ContactService],
  exports: [ContactService],
})
export class ContactModule {}
