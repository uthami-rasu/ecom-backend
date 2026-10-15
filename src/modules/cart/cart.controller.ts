import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  CurrentUser,
  type AuthUser,
} from '../../common/decorators/current-user.decorator.js';
import { ApplyCouponDto } from '../coupons/dto/coupon.dto.js';
import { CartService } from './cart.service.js';
import {
  AddCartItemDto,
  CartQueryDto,
  MergeCartDto,
  UpdateCartItemDto,
} from './dto/cart.dto.js';

@ApiTags('Cart')
@ApiBearerAuth()
@Controller('cart')
export class CartController {
  constructor(private readonly cart: CartService) {}

  @Get()
  get(@CurrentUser() user: AuthUser, @Query() query: CartQueryDto) {
    return this.cart.getCart(user.id, query.shippingMethod);
  }

  @Post('items')
  addItem(@CurrentUser() user: AuthUser, @Body() dto: AddCartItemDto) {
    return this.cart.addItem(user.id, dto);
  }

  @Patch('items/:id')
  updateItem(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCartItemDto,
  ) {
    return this.cart.updateItem(user.id, id, dto.quantity);
  }

  @Delete('items/:id')
  removeItem(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.cart.removeItem(user.id, id);
  }

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  clear(@CurrentUser() user: AuthUser) {
    return this.cart.clear(user.id);
  }

  /** Call right after login with the guest cart kept in the browser. */
  @Post('merge')
  @HttpCode(HttpStatus.OK)
  merge(@CurrentUser() user: AuthUser, @Body() dto: MergeCartDto) {
    return this.cart.merge(user.id, dto);
  }

  @Post('coupon')
  @HttpCode(HttpStatus.OK)
  applyCoupon(@CurrentUser() user: AuthUser, @Body() dto: ApplyCouponDto) {
    return this.cart.applyCoupon(user.id, dto.code);
  }

  @Delete('coupon')
  removeCoupon(@CurrentUser() user: AuthUser) {
    return this.cart.removeCoupon(user.id);
  }
}
