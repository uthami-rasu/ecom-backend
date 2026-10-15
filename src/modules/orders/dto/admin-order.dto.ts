import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDate,
  IsEnum,
  IsOptional,
  IsString,
  IsUrl,
  Length,
  MaxLength,
} from 'class-validator';
import { SanitizeText, Trim } from '../../../common/utils/transforms.js';
import { OrderStatus } from '../entities/order.entity.js';

/** Omitted fields are left unchanged; `null` clears a stored value. */
class TrackingFieldsDto {
  @ApiPropertyOptional({ example: 'Delhivery', nullable: true })
  @IsOptional()
  @SanitizeText()
  @IsString()
  @Length(1, 80)
  carrier?: string | null;

  @ApiPropertyOptional({ example: 'DLV123456789IN', nullable: true })
  @IsOptional()
  @SanitizeText()
  @IsString()
  @Length(1, 80)
  trackingNumber?: string | null;

  @ApiPropertyOptional({
    example: 'https://www.delhivery.com/track/package/DLV123456789IN',
    nullable: true,
  })
  @IsOptional()
  @Trim()
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  @MaxLength(500)
  trackingUrl?: string | null;

  @ApiPropertyOptional({
    type: String,
    format: 'date-time',
    nullable: true,
    description: 'Must not be in the past',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  estimatedDeliveryAt?: Date | null;
}

export class UpdateOrderStatusDto extends TrackingFieldsDto {
  @ApiProperty({
    enum: [
      OrderStatus.Processing,
      OrderStatus.Packed,
      OrderStatus.Shipped,
      OrderStatus.OutForDelivery,
      OrderStatus.Delivered,
      OrderStatus.Cancelled,
    ],
  })
  @IsEnum(OrderStatus)
  status: OrderStatus;

  @ApiPropertyOptional({ description: 'Shown on the order timeline' })
  @IsOptional()
  @SanitizeText()
  @IsString()
  @Length(1, 500)
  note?: string;

  @ApiPropertyOptional({
    default: true,
    description:
      'Email the customer (shipped, out for delivery, delivered, cancelled)',
  })
  @IsOptional()
  @IsBoolean()
  notifyCustomer?: boolean;
}

export class UpdateOrderTrackingDto extends TrackingFieldsDto {
  @ApiPropertyOptional({ description: 'Shown on the order timeline' })
  @IsOptional()
  @SanitizeText()
  @IsString()
  @Length(1, 500)
  note?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  notifyCustomer?: boolean;
}

export class CreateOrderEventDto {
  @ApiPropertyOptional({ example: 'Shipment update', maxLength: 120 })
  @IsOptional()
  @SanitizeText()
  @IsString()
  @Length(1, 120)
  title?: string;

  @ApiProperty({ example: 'Parcel reached the Chennai sorting hub.' })
  @SanitizeText()
  @IsString()
  @Length(3, 500)
  note: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  notifyCustomer?: boolean;
}
