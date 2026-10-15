import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto.js';
import {
  ToBoolean,
  ToStringArray,
  Trim,
} from '../../../common/utils/transforms.js';
import { SLUG_PATTERN } from '../../categories/dto/category.dto.js';

/** Mirrors the storefront's CatalogSort type. */
export const PRODUCT_SORTS = [
  'featured',
  'newest',
  'price-low',
  'price-high',
  'rating',
] as const;
export type ProductSort = (typeof PRODUCT_SORTS)[number];

export class ProductQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Matches name, subtitle and origin',
    example: 'forest',
  })
  @IsOptional()
  @Trim()
  @IsString()
  @Length(1, 100)
  search?: string;

  @ApiPropertyOptional({
    description: 'Category slug; a parent slug includes its sub-categories',
    example: 'honey',
  })
  @IsOptional()
  @Matches(SLUG_PATTERN)
  @MaxLength(100)
  category?: string;

  @ApiPropertyOptional({ description: 'Rupees' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(10_000_000)
  minPrice?: number;

  @ApiPropertyOptional({ description: 'Rupees', example: 1600 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(10_000_000)
  maxPrice?: number;

  @ApiPropertyOptional({
    description: 'Variant labels, comma separated',
    example: '250g,500g',
    type: String,
  })
  @IsOptional()
  @ToStringArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  sizes?: string[];

  @ApiPropertyOptional({ example: 4.5 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(5)
  minRating?: number;

  @ApiPropertyOptional({ enum: PRODUCT_SORTS, default: 'featured' })
  @IsOptional()
  @IsIn(PRODUCT_SORTS)
  sort: ProductSort = 'featured';

  @ApiPropertyOptional()
  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  featured?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  trending?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  inStock?: boolean;
}

export class SuggestQueryDto {
  @ApiPropertyOptional({ example: 'alm' })
  @Trim()
  @IsString()
  @Length(1, 100)
  q: string;

  @ApiPropertyOptional({ default: 4, maximum: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10)
  limit: number = 4;
}
