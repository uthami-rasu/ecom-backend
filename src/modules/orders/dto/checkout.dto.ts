import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { SanitizeText, ToLowerCase } from '../../../common/utils/transforms.js';
import {
  SHIPPING_METHODS,
  type ShippingMethod,
} from '../../pricing/pricing.js';
import { AddressFieldsDto } from '../../users/dto/address.dto.js';

/**
 * Either a saved address id or an inline address must be given for shipping.
 * Billing defaults to the shipping address ("billing same as shipping").
 */
export class CheckoutDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  shippingAddressId?: string;

  @ApiPropertyOptional({ type: AddressFieldsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => AddressFieldsDto)
  shippingAddress?: AddressFieldsDto;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  billingAddressId?: string;

  @ApiPropertyOptional({ type: AddressFieldsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => AddressFieldsDto)
  billingAddress?: AddressFieldsDto;

  @ApiPropertyOptional({ enum: SHIPPING_METHODS, default: 'standard' })
  @IsOptional()
  @IsIn(SHIPPING_METHODS)
  shippingMethod: ShippingMethod = 'standard';

  @ApiPropertyOptional({
    description: 'Order contact email; defaults to the account email',
  })
  @IsOptional()
  @ToLowerCase()
  @IsEmail()
  @MaxLength(254)
  email?: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @SanitizeText()
  @IsString()
  @Length(0, 500)
  notes?: string;
}
