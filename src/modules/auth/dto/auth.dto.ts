import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsIn,
  IsString,
  Length,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import {
  SanitizeText,
  ToLowerCase,
  Trim,
} from '../../../common/utils/transforms.js';
import { OtpPurpose } from '../../otp/entities/email-otp.entity.js';
import type { UserProfile } from '../../users/user.mapper.js';

const PASSWORD_RULE = /^(?=.*[A-Za-z])(?=.*\d).{8,128}$/;
const PASSWORD_MESSAGE =
  'password must be 8-128 characters and contain at least one letter and one number';

export class RegisterDto {
  @ApiProperty({ example: 'sofia@example.com' })
  @ToLowerCase()
  @IsEmail()
  @MaxLength(254)
  email: string;

  @ApiProperty({ example: 'Honey@2026', minLength: 8 })
  @IsString()
  @Matches(PASSWORD_RULE, { message: PASSWORD_MESSAGE })
  password: string;

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
}

export class LoginDto {
  @ApiProperty({ example: 'sofia@example.com' })
  @ToLowerCase()
  @IsEmail()
  @MaxLength(254)
  email: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  password: string;
}

export class RefreshTokenDto {
  @ApiProperty()
  @IsString()
  @Length(20, 200)
  refreshToken: string;
}

export class ChangePasswordDto {
  @ApiProperty()
  @IsString()
  @MaxLength(128)
  currentPassword: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @Matches(PASSWORD_RULE, {
    message: PASSWORD_MESSAGE.replace('password', 'newPassword'),
  })
  newPassword: string;
}

/** Purposes a code can be (re)requested for without being signed in. */
export const PUBLIC_OTP_PURPOSES = [
  OtpPurpose.VerifyEmail,
  OtpPurpose.ResetPassword,
] as const;

const OtpCode = () =>
  Matches(/^\d{6}$/, { message: 'code must be a 6-digit number' });

export class EmailDto {
  @ApiProperty({ example: 'sofia@example.com' })
  @ToLowerCase()
  @IsEmail()
  @MaxLength(254)
  email: string;
}

export class VerifyEmailDto extends EmailDto {
  @ApiProperty({
    example: '042917',
    description: '6-digit code from the email',
  })
  @Trim()
  @IsString()
  @OtpCode()
  code: string;
}

export class ResendOtpDto extends EmailDto {
  @ApiProperty({ enum: PUBLIC_OTP_PURPOSES })
  @IsIn(PUBLIC_OTP_PURPOSES)
  purpose: (typeof PUBLIC_OTP_PURPOSES)[number];
}

export class ResetPasswordDto extends VerifyEmailDto {
  @ApiProperty({ minLength: 8 })
  @IsString()
  @Matches(PASSWORD_RULE, {
    message: PASSWORD_MESSAGE.replace('password', 'newPassword'),
  })
  newPassword: string;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  user: UserProfile;
}
