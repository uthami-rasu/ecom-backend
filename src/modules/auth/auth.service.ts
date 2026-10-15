import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Role } from '../../common/enums/role.enum.js';
import { OtpPurpose } from '../otp/entities/email-otp.entity.js';
import {
  INVALID_CODE,
  OtpService,
  type OtpChallenge,
} from '../otp/otp.service.js';
import type { User } from '../users/entities/user.entity.js';
import { toUserProfile } from '../users/user.mapper.js';
import { UsersService } from '../users/users.service.js';
import type {
  AuthResponse,
  ChangePasswordDto,
  LoginDto,
  RegisterDto,
  ResendOtpDto,
  ResetPasswordDto,
  VerifyEmailDto,
} from './dto/auth.dto.js';
import { TokenService } from './token.service.js';

const INVALID_CREDENTIALS = 'Invalid email or password';
export const EMAIL_NOT_VERIFIED = 'EMAIL_NOT_VERIFIED';

@Injectable()
export class AuthService {
  /** Verified against when the email is unknown so response time does not reveal which emails exist. */
  private dummyHash?: Promise<string>;

  constructor(
    private readonly users: UsersService,
    private readonly tokens: TokenService,
    private readonly otp: OtpService,
  ) {}

  /**
   * Creates an unverified customer and emails a verification code; tokens are issued only
   * by verifyEmail. Registering again with a never-verified address replaces its name and
   * password (the inbox owner wins) and sends a fresh code, subject to the resend cooldown.
   */
  async register(dto: RegisterDto): Promise<OtpChallenge> {
    const existing = await this.users.findByEmail(dto.email);
    let user: User;
    if (existing) {
      if (existing.emailVerifiedAt || !existing.isActive)
        throw new ConflictException(
          'An account with this email already exists',
        );
      user = await this.users.updateUnverifiedRegistration(existing, dto);
    } else {
      // Self-registration can only ever create customers.
      user = await this.users.create({ ...dto, role: Role.Customer });
    }
    await this.otp.issue(user, OtpPurpose.VerifyEmail, {
      respectCooldown: Boolean(existing),
    });
    return this.otp.challenge(user.email, OtpPurpose.VerifyEmail);
  }

  async verifyEmail(dto: VerifyEmailDto): Promise<AuthResponse> {
    const user = await this.findActiveForCode(dto.email);
    await this.otp.verify(user.id, OtpPurpose.VerifyEmail, dto.code);
    return this.issueTokens(await this.users.markEmailVerified(user));
  }

  /** Always answers the same way, whether or not the account exists (no enumeration). */
  async resendOtp(dto: ResendOtpDto): Promise<OtpChallenge> {
    const user = await this.users.findByEmail(dto.email);
    const alreadyVerified =
      dto.purpose === OtpPurpose.VerifyEmail && !!user?.emailVerifiedAt;
    if (user?.isActive && !alreadyVerified)
      await this.otp.issue(user, dto.purpose, { respectCooldown: true });
    return this.otp.challenge(dto.email, dto.purpose);
  }

  forgotPassword(email: string): Promise<OtpChallenge> {
    return this.resendOtp({ email, purpose: OtpPurpose.ResetPassword });
  }

  /** Proves inbox ownership, so it also verifies the email; every other session is signed out. */
  async resetPassword(dto: ResetPasswordDto): Promise<AuthResponse> {
    const user = await this.findActiveForCode(dto.email);
    await this.otp.verify(user.id, OtpPurpose.ResetPassword, dto.code);
    await this.users.updatePassword(user.id, dto.newPassword);
    await this.users.markEmailVerified(user);
    await this.tokens.revokeAllForUser(user.id);
    return this.issueTokens(user);
  }

  async login(dto: LoginDto): Promise<AuthResponse> {
    const user = await this.users.findByEmailWithPassword(dto.email);
    if (!user) {
      this.dummyHash ??= UsersService.hashPassword('timing-equaliser-password');
      await this.users.verifyPassword(
        { passwordHash: await this.dummyHash } as User,
        dto.password,
      );
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }
    const valid = await this.users.verifyPassword(user, dto.password);
    if (!valid || !user.isActive)
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    if (!user.emailVerifiedAt) {
      // Only reachable with the correct password, so revealing the state is safe.
      await this.otp.issue(user, OtpPurpose.VerifyEmail, {
        respectCooldown: true,
      });
      throw new ForbiddenException({
        statusCode: 403,
        error: 'Forbidden',
        code: EMAIL_NOT_VERIFIED,
        message: 'Please verify your email to continue',
        email: user.email,
      });
    }
    return this.issueTokens(user);
  }

  async refresh(refreshToken: string): Promise<AuthResponse> {
    const { userId, refreshToken: rotated } =
      await this.tokens.rotate(refreshToken);
    const user = await this.users.findById(userId);
    if (!user || !user.isActive) {
      await this.tokens.revokeAllForUser(userId);
      throw new UnauthorizedException('Account is no longer active');
    }
    return {
      accessToken: await this.tokens.signAccessToken(user),
      refreshToken: rotated,
      tokenType: 'Bearer',
      expiresIn: this.tokens.accessTtlSeconds,
      user: toUserProfile(user),
    };
  }

  logout(refreshToken: string): Promise<void> {
    return this.tokens.revoke(refreshToken);
  }

  /** Changing the password signs the user out everywhere else. */
  async changePassword(
    userId: string,
    dto: ChangePasswordDto,
  ): Promise<AuthResponse> {
    const user = await this.users.findByIdWithPassword(userId);
    if (!user || !user.isActive) throw new UnauthorizedException();
    if (!(await this.users.verifyPassword(user, dto.currentPassword))) {
      throw new UnauthorizedException('Current password is incorrect');
    }
    await this.users.updatePassword(userId, dto.newPassword);
    await this.tokens.revokeAllForUser(userId);
    return this.issueTokens(user);
  }

  /** Unknown and inactive accounts get the same error as a wrong code. */
  private async findActiveForCode(email: string): Promise<User> {
    const user = await this.users.findByEmail(email);
    if (!user || !user.isActive) throw new BadRequestException(INVALID_CODE);
    return user;
  }

  private async issueTokens(user: User): Promise<AuthResponse> {
    const [accessToken, refreshToken] = await Promise.all([
      this.tokens.signAccessToken(user),
      this.tokens.issueRefreshToken(user.id),
    ]);
    return {
      accessToken,
      refreshToken,
      tokenType: 'Bearer',
      expiresIn: this.tokens.accessTtlSeconds,
      user: toUserProfile(user),
    };
  }
}
