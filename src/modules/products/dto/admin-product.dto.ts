import {
  ApiProperty,
  ApiPropertyOptional,
  OmitType,
  PartialType,
} from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto.js';
import {
  SanitizeText,
  ToBoolean,
  ToLowerCase,
  ToUpperCase,
  Trim,
} from '../../../common/utils/transforms.js';
import { SLUG_PATTERN } from '../../categories/dto/category.dto.js';

export class CreateVariantDto {
  @ApiProperty({ example: '500g' })
  @SanitizeText()
  @IsString()
  @Length(1, 40)
  label: string;

  @ApiPropertyOptional({
    example: 'HON-001-500G',
    description: 'Generated when omitted',
  })
  @IsOptional()
  @ToUpperCase()
  @Matches(/^[A-Z0-9-]{3,64}$/, {
    message: 'sku may contain A-Z, 0-9 and hyphens (3-64 chars)',
  })
  sku?: string;

  @ApiProperty({ example: 480, description: 'Rupees' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(10_000_000)
  price: number;

  @ApiPropertyOptional({
    example: 560,
    description: 'Rupees; must be greater than price',
    nullable: true,
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(10_000_000)
  compareAtPrice?: number | null;

  @ApiProperty({ example: 40 })
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  stock: number;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1000)
  sortOrder?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateVariantDto extends PartialType(CreateVariantDto) {}

export class CreateProductDto {
  @ApiProperty({ example: 'Melora Raw Forest Honey' })
  @SanitizeText()
  @IsString()
  @Length(2, 160)
  name: string;

  @ApiPropertyOptional({
    example: 'melora-raw-forest-honey',
    description: 'Generated from name when omitted',
  })
  @IsOptional()
  @ToLowerCase()
  @Matches(SLUG_PATTERN, {
    message: 'slug may contain lowercase letters, numbers and single hyphens',
  })
  @Length(2, 180)
  slug?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @SanitizeText()
  @IsString()
  @Length(0, 300)
  subtitle?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @SanitizeText()
  @IsString()
  @Length(0, 10_000)
  description?: string;

  @ApiPropertyOptional({ example: 'Western Ghats' })
  @IsOptional()
  @SanitizeText()
  @IsString()
  @Length(0, 120)
  origin?: string;

  @ApiPropertyOptional({ example: 'Bestseller', nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @SanitizeText()
  @IsString()
  @Length(1, 40)
  badge?: string | null;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  categoryId: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isFeatured?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isTrending?: boolean;

  @ApiProperty({ type: [CreateVariantDto] })
  @ValidateNested({ each: true })
  @Type(() => CreateVariantDto)
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  variants: CreateVariantDto[];
}

/** Variants are managed through their own endpoints after creation. */
export class UpdateProductDto extends PartialType(
  OmitType(CreateProductDto, ['variants'] as const),
) {}

export const STOCK_STATUSES = [
  'in_stock',
  'low_stock',
  'out_of_stock',
] as const;
export type StockStatus = (typeof STOCK_STATUSES)[number];

export class AdminProductQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Name, slug or SKU' })
  @IsOptional()
  @Trim()
  @IsString()
  @Length(1, 100)
  search?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ enum: STOCK_STATUSES })
  @IsOptional()
  @IsIn(STOCK_STATUSES)
  stockStatus?: StockStatus;

  @ApiPropertyOptional({
    enum: ['newest', 'name', 'price-low', 'price-high', 'stock-low'],
    default: 'newest',
  })
  @IsOptional()
  @IsIn(['newest', 'name', 'price-low', 'price-high', 'stock-low'])
  sort: 'newest' | 'name' | 'price-low' | 'price-high' | 'stock-low' = 'newest';
}

export class ImageUploadMetaDto {
  @ApiPropertyOptional({ example: 'Jar of forest honey on a wooden table' })
  @IsOptional()
  @SanitizeText()
  @IsString()
  @Length(0, 200)
  alt?: string;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  sortOrder?: number;
}
