import {
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto.js';
import { ContactService } from '../../contact/contact.service.js';
import { AdminOnly } from '../admin.decorator.js';

@ApiTags('Admin · Contact messages')
@AdminOnly()
@Controller('admin/contact-messages')
export class AdminContactController {
  constructor(private readonly contact: ContactService) {}

  @Get()
  list(@Query() query: PaginationQueryDto) {
    return this.contact.listMessages(query);
  }

  @Patch(':id/resolve')
  async resolve(@Param('id', ParseUUIDPipe) id: string) {
    if (!(await this.contact.resolveMessage(id)))
      throw new NotFoundException('Message not found');
    return { id, isResolved: true };
  }
}
