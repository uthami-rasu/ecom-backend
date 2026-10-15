import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsBoolean,
  IsISO31661Alpha2,
  IsOptional,
  IsString,
  Length,
  Matches,
} from 'class-validator';
import { SanitizeText, ToUpperCase } from '../../../common/utils/transforms.js';
import { PHONE_PATTERN } from './update-profile.dto.js';

/** Shared by saved addresses and inline checkout addresses. */
export class AddressFieldsDto {
  @ApiProperty({ example: 'Sofia' })
  @SanitizeText()
  @IsString()
  @Length(1, 80)
  firstName: string;

  @ApiProperty({ example: 'Havertz' })
  @SanitizeText()
  @IsString()
  @Length(1, 80)
  lastName: string;

  @ApiProperty({ example: '+91 98765 43210' })
  @IsString()
  @Matches(PHONE_PATTERN, { message: 'phone must be a valid phone number' })
  phone: string;

  @ApiProperty({ example: '5D/12B Pasuvanthanal Road' })
  @SanitizeText()
  @IsString()
  @Length(3, 200)
  line1: string;

  @ApiPropertyOptional()
  @IsOptional()
  @SanitizeText()
  @IsString()
  @Length(0, 200)
  line2?: string;

  @ApiProperty({ example: 'Kovilpatti' })
  @SanitizeText()
  @IsString()
  @Length(2, 100)
  city: string;

  @ApiProperty({ example: 'Tamil Nadu' })
  @SanitizeText()
  @IsString()
  @Length(2, 100)
  state: string;

  @ApiProperty({ example: '628501' })
  @IsString()
  @Matches(/^[A-Za-z0-9 -]{3,12}$/, {
    message: 'postalCode must be a valid postal code',
  })
  postalCode: string;

  @ApiPropertyOptional({ example: 'IN', default: 'IN' })
  @IsOptional()
  @ToUpperCase()
  @IsISO31661Alpha2()
  country?: string;
}

export class CreateAddressDto extends AddressFieldsDto {
  @ApiPropertyOptional({ example: 'Home' })
  @IsOptional()
  @SanitizeText()
  @IsString()
  @Length(1, 40)
  label?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isDefaultShipping?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isDefaultBilling?: boolean;
}

export class UpdateAddressDto extends PartialType(CreateAddressDto) {}
