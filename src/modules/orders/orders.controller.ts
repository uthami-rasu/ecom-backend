import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  CurrentUser,
  type AuthUser,
} from '../../common/decorators/current-user.decorator.js';
import { PaginationQueryDto } from '../../common/dto/pagination.dto.js';
import { CheckoutDto } from './dto/checkout.dto.js';
import { OrdersService } from './orders.service.js';
import { OrderNumberPipe } from './order-number.pipe.js';

@ApiTags('Orders')
@ApiBearerAuth()
@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  /** Places an order from the current cart. Pay for it via POST /payments/orders/:orderNumber. */
  @Post()
  checkout(@CurrentUser() user: AuthUser, @Body() dto: CheckoutDto) {
    return this.orders.checkout(user, dto);
  }

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: PaginationQueryDto) {
    return this.orders.listForUser(user.id, query);
  }

  @Get(':orderNumber')
  get(
    @CurrentUser() user: AuthUser,
    @Param('orderNumber', OrderNumberPipe) orderNumber: string,
  ) {
    return this.orders.getForUser(user.id, orderNumber);
  }

  @Post(':orderNumber/cancel')
  @HttpCode(HttpStatus.OK)
  cancel(
    @CurrentUser() user: AuthUser,
    @Param('orderNumber', OrderNumberPipe) orderNumber: string,
  ) {
    return this.orders.cancelForUser(user.id, orderNumber);
  }
}
