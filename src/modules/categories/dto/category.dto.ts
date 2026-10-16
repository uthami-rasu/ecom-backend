import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
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
  ToLowerCase,
} from '../../../common/utils/transforms.js';

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export class CreateCategoryDto {
  @ApiProperty({ example: 'Raw honey' })
  @SanitizeText()
  @IsString()
  @Length(2, 80)
  name: string;

  @ApiPropertyOptional({
    example: 'raw-honey',
    description: 'Generated from name when omitted',
  })
  @IsOptional()
  @ToLowerCase()
  @Matches(SLUG_PATTERN, {
    message: 'slug may contain lowercase letters, numbers and single hyphens',
  })
  @Length(2, 100)
  slug?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @SanitizeText()
  @IsString()
  @Length(0, 2000)
  description?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    nullable: true,
    description: 'Parent must be a top-level category',
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  parentId?: string | null;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10_000)
  sortOrder?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateCategoryDto extends PartialType(CreateCategoryDto) {}

export class AdminCategoryQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 100)
  search?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  parentId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({
    enum: ['newest', 'oldest', 'name', 'products', 'order'],
  })
  @IsOptional()
  @IsIn(['newest', 'oldest', 'name', 'products', 'order'])
  sort?: 'newest' | 'oldest' | 'name' | 'products' | 'order';
}
