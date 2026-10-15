import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Length, Matches } from 'class-validator';
import { SanitizeText } from '../../../common/utils/transforms.js';

export const PHONE_PATTERN = /^\+?[0-9 ()-]{7,20}$/;

/** Email is not editable here: it changes only through POST /users/me/email-change (+ /confirm). */
export class UpdateProfileDto {
  @ApiPropertyOptional({ example: 'Sofia' })
  @IsOptional()
  @SanitizeText()
  @IsString()
  @Length(1, 80)
  firstName?: string;

  @ApiPropertyOptional({ example: 'Havertz' })
  @IsOptional()
  @SanitizeText()
  @IsString()
  @Length(1, 80)
  lastName?: string;

  @ApiPropertyOptional({ example: 'Sofia H.' })
  @IsOptional()
  @SanitizeText()
  @IsString()
  @Length(1, 80)
  displayName?: string;

  @ApiPropertyOptional({ example: '+91 98765 43210' })
  @IsOptional()
  @IsString()
  @Matches(PHONE_PATTERN, { message: 'phone must be a valid phone number' })
  phone?: string;
}
