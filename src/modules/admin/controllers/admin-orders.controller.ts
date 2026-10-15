import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  CurrentUser,
  type AuthUser,
} from '../../../common/decorators/current-user.decorator.js';
import {
  CreateOrderEventDto,
  UpdateOrderStatusDto,
  UpdateOrderTrackingDto,
} from '../../orders/dto/admin-order.dto.js';
import { AdminOrderQueryDto } from '../../orders/dto/order-query.dto.js';
import { OrdersService } from '../../orders/orders.service.js';
import { AdminOnly } from '../admin.decorator.js';

@ApiTags('Admin · Orders')
@AdminOnly()
@Controller('admin/orders')
export class AdminOrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get()
  list(@Query() query: AdminOrderQueryDto) {
    return this.orders.adminList(query);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.orders.adminGet(id);
  }

  /** Validated lifecycle transition (+ optional tracking fields and timeline note). */
  @Patch(':id/status')
  updateStatus(
    @CurrentUser() admin: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateOrderStatusDto,
  ) {
    return this.orders.adminUpdateStatus(id, dto, admin.id);
  }

  @Patch(':id/tracking')
  updateTracking(
    @CurrentUser() admin: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateOrderTrackingDto,
  ) {
    return this.orders.adminUpdateTracking(id, dto, admin.id);
  }

  /** Adds a custom update to the order timeline; responds with the order detail. */
  @Post(':id/events')
  addEvent(
    @CurrentUser() admin: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateOrderEventDto,
  ) {
    return this.orders.adminAddEvent(id, dto, admin.id);
  }
}
