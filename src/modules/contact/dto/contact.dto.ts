import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  Equals,
  IsBoolean,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';
import {
  SanitizeText,
  ToLowerCase,
  ToUpperCase,
} from '../../../common/utils/transforms.js';
import { PHONE_PATTERN } from '../../users/dto/update-profile.dto.js';
import { CONTACT_SUBJECTS } from '../entities/contact-message.entity.js';

export class CreateContactMessageDto {
  @ApiProperty({ example: 'John Doe' })
  @SanitizeText()
  @IsString()
  @Length(2, 120)
  fullName: string;

  @ApiProperty({ example: 'john@example.com' })
  @ToLowerCase()
  @IsEmail()
  @MaxLength(254)
  email: string;

  @ApiProperty({ example: '+91 98765 43210' })
  @IsString()
  @Matches(PHONE_PATTERN, { message: 'phone must be a valid phone number' })
  phone: string;

  @ApiPropertyOptional({ example: 'BSC-7KQ2M9XA' })
  @IsOptional()
  @ToUpperCase()
  @Matches(/^#?BSC-[0-9A-Z]{5,8}$/, {
    message: 'orderNumber must look like BSC-XXXXXXXX',
  })
  orderNumber?: string;

  @ApiProperty({ enum: CONTACT_SUBJECTS })
  @IsIn(CONTACT_SUBJECTS)
  subject: (typeof CONTACT_SUBJECTS)[number];

  @ApiProperty({ example: 'How can I order a custom hamper?' })
  @SanitizeText()
  @IsString()
  @Length(10, 5000)
  message: string;

  @ApiProperty({ description: 'Privacy policy consent checkbox' })
  @IsBoolean()
  @Equals(true, { message: 'consent must be accepted' })
  consent: boolean;
}

export class NewsletterDto {
  @ApiProperty({ example: 'reader@example.com' })
  @ToLowerCase()
  @IsEmail()
  @MaxLength(254)
  email: string;
}
