import {
  Body,
  Controller,
  Inject,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import {
  CurrentUser,
  type AuthUser,
} from '../../common/decorators/current-user.decorator.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { OrderNumberPipe } from '../orders/order-number.pipe.js';
import { ConfirmPaymentDto, MockCheckoutDto } from './dto/payment.dto.js';
import { PaymentsService } from './payments.service.js';
import { MockPaymentProvider } from './providers/mock-payment.provider.js';
import {
  PAYMENT_PROVIDER,
  type PaymentProvider,
} from './providers/payment-provider.interface.js';

@ApiTags('Payments')
@Controller('payments')
export class PaymentsController {
  constructor(
    private readonly payments: PaymentsService,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
  ) {}

  /** Step 1: create a gateway order for an unpaid order. */
  @ApiBearerAuth()
  @Post('orders/:orderNumber')
  initiate(
    @CurrentUser() user: AuthUser,
    @Param('orderNumber', OrderNumberPipe) orderNumber: string,
  ) {
    return this.payments.initiate(user.id, orderNumber);
  }

  /** Step 3: verify what the gateway widget returned (Razorpay: payment id + signature). */
  @ApiBearerAuth()
  @Post(':id/confirm')
  @HttpCode(HttpStatus.OK)
  confirm(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ConfirmPaymentDto,
  ) {
    return this.payments.confirm(user.id, id, dto);
  }

  @ApiBearerAuth()
  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.payments.getView(user.id, id);
  }

  /**
   * Step 2 (mock only): stands in for the gateway's checkout widget and returns the
   * payment id + signature the widget would give the browser. 404 for real providers.
   */
  @ApiBearerAuth()
  @Post(':id/mock-checkout')
  @HttpCode(HttpStatus.OK)
  async mockCheckout(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MockCheckoutDto,
  ) {
    if (!(this.provider instanceof MockPaymentProvider))
      throw new NotFoundException();
    const providerOrderId = await this.payments.getOwnedProviderOrderId(
      user.id,
      id,
    );
    return this.provider.simulateCheckout(providerOrderId, dto.outcome);
  }

  /** Step 4: asynchronous status updates from the gateway (resolves "pending" payments). */
  @Public()
  @SkipThrottle()
  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  @ApiHeader({
    name: 'x-payment-signature',
    description:
      'Hex HMAC-SHA256 of the raw body (Razorpay: x-razorpay-signature)',
  })
  webhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-payment-signature') signature?: string,
  ) {
    return this.payments.handleWebhook(req.rawBody, signature);
  }
}
