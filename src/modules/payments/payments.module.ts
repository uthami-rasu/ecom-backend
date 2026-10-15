import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrdersModule } from '../orders/orders.module.js';
import { Payment } from './payment.entity.js';
import { PaymentsController } from './payments.controller.js';
import { PaymentsService } from './payments.service.js';
import { MockPaymentProvider } from './providers/mock-payment.provider.js';
import { PAYMENT_PROVIDER } from './providers/payment-provider.interface.js';

@Module({
  imports: [TypeOrmModule.forFeature([Payment]), OrdersModule],
  controllers: [PaymentsController],
  providers: [
    PaymentsService,
    MockPaymentProvider,
    // Swap in RazorpayPaymentProvider here (selected by PAYMENT_PROVIDER) when integrating.
    { provide: PAYMENT_PROVIDER, useExisting: MockPaymentProvider },
  ],
})
export class PaymentsModule {}
