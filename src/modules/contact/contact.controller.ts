import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator.js';
import { StrictRateLimit } from '../../common/decorators/strict-rate-limit.decorator.js';
import { ContactService } from './contact.service.js';
import { CreateContactMessageDto, NewsletterDto } from './dto/contact.dto.js';

@ApiTags('Contact')
@Public()
@StrictRateLimit()
@Controller()
export class ContactController {
  constructor(private readonly contact: ContactService) {}

  @Post('contact')
  create(@Body() dto: CreateContactMessageDto) {
    return this.contact.createMessage(dto);
  }

  @Post('newsletter')
  @HttpCode(HttpStatus.OK)
  subscribe(@Body() dto: NewsletterDto) {
    return this.contact.subscribe(dto);
  }
}
