import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString, Length, Matches } from 'class-validator';
import {
  MOCK_OUTCOMES,
  type MockOutcome,
} from '../providers/mock-payment.provider.js';

export class ConfirmPaymentDto {
  @ApiProperty({
    example: 'mock_pay_success_ab12cd34',
    description: 'Razorpay: razorpay_payment_id',
  })
  @IsString()
  @Length(5, 100)
  @Matches(/^[A-Za-z0-9_]+$/)
  providerPaymentId: string;

  @ApiProperty({
    description: 'Razorpay: razorpay_signature (hex HMAC-SHA256)',
  })
  @IsString()
  @Matches(/^[0-9a-f]{64}$/i, {
    message: 'signature must be a hex encoded SHA-256 HMAC',
  })
  signature: string;
}

export class MockCheckoutDto {
  @ApiProperty({
    enum: MOCK_OUTCOMES,
    description: 'Outcome the mock gateway should simulate',
  })
  @IsIn(MOCK_OUTCOMES)
  outcome: MockOutcome;
}
