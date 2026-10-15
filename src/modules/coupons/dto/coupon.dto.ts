import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDate,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto.js';
import {
  SanitizeText,
  ToBoolean,
  ToUpperCase,
  Trim,
} from '../../../common/utils/transforms.js';
import { CouponType } from '../coupon.entity.js';

export const COUPON_CODE_PATTERN = /^[A-Z0-9_-]{3,40}$/;

export class ApplyCouponDto {
  @ApiProperty({ example: 'WELCOME10' })
  @ToUpperCase()
  @IsString()
  @Matches(COUPON_CODE_PATTERN, { message: 'code is not a valid coupon code' })
  code: string;
}

export class CreateCouponDto {
  @ApiProperty({ example: 'WELCOME10' })
  @ToUpperCase()
  @Matches(COUPON_CODE_PATTERN, {
    message: 'code may contain A-Z, 0-9, "_" and "-" (3-40 chars)',
  })
  code: string;

  @ApiPropertyOptional()
  @IsOptional()
  @SanitizeText()
  @IsString()
  @Length(0, 200)
  description?: string;

  @ApiProperty({ enum: CouponType })
  @IsEnum(CouponType)
  type: CouponType;

  @ApiProperty({
    description:
      'Percent (1-100) for percentage coupons, rupees for fixed coupons',
    example: 10,
  })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(1_000_000)
  value: number;

  @ApiPropertyOptional({ description: 'Rupees', default: 0 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  minSubtotal?: number;

  @ApiPropertyOptional({ description: 'Rupees', nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  maxDiscount?: number | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Type(() => Date)
  @IsDate()
  startsAt?: Date | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Type(() => Date)
  @IsDate()
  expiresAt?: Date | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsInt()
  @Min(1)
  usageLimit?: number | null;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateCouponDto extends PartialType(CreateCouponDto) {}

export class AdminCouponQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Trim()
  @IsString()
  @Length(1, 40)
  search?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  isActive?: boolean;
}
