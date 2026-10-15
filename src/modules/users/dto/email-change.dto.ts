import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, Matches, MaxLength } from 'class-validator';
import { ToLowerCase, Trim } from '../../../common/utils/transforms.js';

export class RequestEmailChangeDto {
  @ApiProperty({ example: 'sofia.new@example.com' })
  @ToLowerCase()
  @IsEmail()
  @MaxLength(254)
  newEmail: string;

  @ApiProperty({ description: 'Current password (re-authentication)' })
  @IsString()
  @MaxLength(128)
  password: string;
}

export class ConfirmEmailChangeDto {
  @ApiProperty({
    example: '042917',
    description: '6-digit code sent to the new address',
  })
  @Trim()
  @IsString()
  @Matches(/^\d{6}$/, { message: 'code must be a 6-digit number' })
  code: string;
}
