import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsIn,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  SHIPPING_METHODS,
  type ShippingMethod,
} from '../../pricing/pricing.js';

export const MAX_LINE_QUANTITY = 20;

export class AddCartItemDto {
  @ApiProperty({
    format: 'uuid',
    description: 'Product variant (pack size) id',
  })
  @IsUUID()
  variantId: string;

  @ApiProperty({ minimum: 1, maximum: MAX_LINE_QUANTITY, default: 1 })
  @IsInt()
  @Min(1)
  @Max(MAX_LINE_QUANTITY)
  quantity: number;
}

export class UpdateCartItemDto {
  @ApiProperty({ minimum: 1, maximum: MAX_LINE_QUANTITY })
  @IsInt()
  @Min(1)
  @Max(MAX_LINE_QUANTITY)
  quantity: number;
}

export class MergeCartDto {
  @ApiProperty({
    type: [AddCartItemDto],
    description: 'Guest cart lines kept in the browser before login',
  })
  @ValidateNested({ each: true })
  @Type(() => AddCartItemDto)
  @ArrayMaxSize(50)
  items: AddCartItemDto[];
}

export class CartQueryDto {
  @ApiPropertyOptional({ enum: SHIPPING_METHODS, default: 'standard' })
  @IsOptional()
  @IsIn(SHIPPING_METHODS)
  shippingMethod: ShippingMethod = 'standard';
}
