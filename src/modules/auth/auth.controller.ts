import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiTooManyRequestsResponse,
} from '@nestjs/swagger';
import {
  CurrentUser,
  type AuthUser,
} from '../../common/decorators/current-user.decorator.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { StrictRateLimit } from '../../common/decorators/strict-rate-limit.decorator.js';
import { UsersService } from '../users/users.service.js';
import { AuthService } from './auth.service.js';
import {
  ChangePasswordDto,
  EmailDto,
  LoginDto,
  RefreshTokenDto,
  RegisterDto,
  ResendOtpDto,
  ResetPasswordDto,
  VerifyEmailDto,
} from './dto/auth.dto.js';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly users: UsersService,
  ) {}

  @Public()
  @StrictRateLimit()
  @ApiTooManyRequestsResponse({ description: 'Rate limited' })
  @ApiCreatedResponse({
    description: 'OtpChallenge — a verification code was emailed',
  })
  @ApiConflictResponse({ description: 'Email already registered and verified' })
  @ApiServiceUnavailableResponse({ description: 'Email could not be sent' })
  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Public()
  @StrictRateLimit()
  @ApiTooManyRequestsResponse({ description: 'Rate limited' })
  @ApiBadRequestResponse({
    description: 'Invalid or expired code / too many attempts',
  })
  @HttpCode(HttpStatus.OK)
  @Post('verify-email')
  verifyEmail(@Body() dto: VerifyEmailDto) {
    return this.auth.verifyEmail(dto);
  }

  /** Always 202, whether or not the account exists. */
  @Public()
  @StrictRateLimit()
  @ApiTooManyRequestsResponse({ description: 'Rate limited' })
  @ApiAcceptedResponse({ description: 'OtpChallenge' })
  @HttpCode(HttpStatus.ACCEPTED)
  @Post('resend-otp')
  resendOtp(@Body() dto: ResendOtpDto) {
    return this.auth.resendOtp(dto);
  }

  @Public()
  @StrictRateLimit()
  @ApiTooManyRequestsResponse({ description: 'Rate limited' })
  @ApiForbiddenResponse({
    description:
      'Email not verified: { code: "EMAIL_NOT_VERIFIED", email } — a code is sent',
  })
  @HttpCode(HttpStatus.OK)
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  /** Always 202, whether or not the account exists. */
  @Public()
  @StrictRateLimit()
  @ApiTooManyRequestsResponse({ description: 'Rate limited' })
  @ApiAcceptedResponse({ description: 'OtpChallenge' })
  @HttpCode(HttpStatus.ACCEPTED)
  @Post('forgot-password')
  forgotPassword(@Body() dto: EmailDto) {
    return this.auth.forgotPassword(dto.email);
  }

  /** Sets a new password with the emailed code and signs out every other session. */
  @Public()
  @StrictRateLimit()
  @ApiTooManyRequestsResponse({ description: 'Rate limited' })
  @ApiBadRequestResponse({
    description: 'Invalid or expired code / too many attempts',
  })
  @HttpCode(HttpStatus.OK)
  @Post('reset-password')
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.auth.resetPassword(dto);
  }

  @Public()
  @StrictRateLimit()
  @HttpCode(HttpStatus.OK)
  @Post('refresh')
  refresh(@Body() dto: RefreshTokenDto) {
    return this.auth.refresh(dto.refreshToken);
  }

  @Public()
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('logout')
  logout(@Body() dto: RefreshTokenDto) {
    return this.auth.logout(dto.refreshToken);
  }

  @ApiBearerAuth()
  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.users.getProfile(user.id);
  }

  @ApiBearerAuth()
  @StrictRateLimit()
  @HttpCode(HttpStatus.OK)
  @Post('change-password')
  changePassword(
    @CurrentUser() user: AuthUser,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.auth.changePassword(user.id, dto);
  }
}
