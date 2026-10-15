import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Role } from '../../common/enums/role.enum.js';
import { OtpPurpose } from '../otp/entities/email-otp.entity.js';
import type { OtpService } from '../otp/otp.service.js';
import type { User } from '../users/entities/user.entity.js';
import { UsersService } from '../users/users.service.js';
import { AuthService } from './auth.service.js';
import type { TokenService } from './token.service.js';

const makeUser = (overrides: Partial<User> = {}): User =>
  ({
    id: 'user-1',
    email: 'sofia@example.com',
    passwordHash: 'hash',
    firstName: 'Sofia',
    lastName: 'Havertz',
    displayName: 'Sofia Havertz',
    phone: null,
    avatarUrl: null,
    role: Role.Customer,
    isActive: true,
    emailVerifiedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }) as User;

describe('AuthService', () => {
  let users: Record<string, ReturnType<typeof vi.fn>>;
  let tokens: Record<string, unknown>;
  let otp: Record<string, ReturnType<typeof vi.fn>>;
  let service: AuthService;

  beforeEach(() => {
    users = {
      create: vi.fn(async (input) =>
        makeUser({
          email: input.email,
          role: input.role,
          emailVerifiedAt: null,
        }),
      ),
      findByEmail: vi.fn(async () => null),
      updateUnverifiedRegistration: vi.fn(async (user) => user),
      markEmailVerified: vi.fn(async (user) => ({
        ...user,
        emailVerifiedAt: new Date(),
      })),
      findByEmailWithPassword: vi.fn(),
      findByIdWithPassword: vi.fn(),
      findById: vi.fn(),
      verifyPassword: vi.fn(),
      updatePassword: vi.fn(),
    };
    tokens = {
      accessTtlSeconds: 900,
      signAccessToken: vi.fn(async () => 'access'),
      issueRefreshToken: vi.fn(async () => 'refresh'),
      rotate: vi.fn(),
      revoke: vi.fn(),
      revokeAllForUser: vi.fn(),
    };
    otp = {
      issue: vi.fn(async () => true),
      verify: vi.fn(async () => ({})),
      challenge: vi.fn((email: string, purpose: OtpPurpose) => ({
        email,
        purpose,
        expiresInSeconds: 600,
        resendAfterSeconds: 60,
      })),
    };
    service = new AuthService(
      users as unknown as UsersService,
      tokens as unknown as TokenService,
      otp as unknown as OtpService,
    );
  });

  it('always registers unverified customers and sends a code instead of tokens', async () => {
    const result = await service.register({
      email: 'a@b.co',
      password: 'Secret@123',
      firstName: 'A',
      lastName: 'B',
      role: Role.Admin,
    } as never);
    expect(users.create).toHaveBeenCalledWith(
      expect.objectContaining({ role: Role.Customer }),
    );
    expect(otp.issue).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'a@b.co' }),
      OtpPurpose.VerifyEmail,
      { respectCooldown: false },
    );
    expect(result).toEqual({
      email: 'a@b.co',
      purpose: OtpPurpose.VerifyEmail,
      expiresInSeconds: 600,
      resendAfterSeconds: 60,
    });
    expect(tokens.issueRefreshToken).not.toHaveBeenCalled();
  });

  it('rejects registering a verified email but lets an unverified one re-register', async () => {
    users.findByEmail.mockResolvedValue(makeUser());
    await expect(
      service.register({
        email: 'sofia@example.com',
        password: 'Secret@123',
        firstName: 'A',
        lastName: 'B',
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    const pending = makeUser({ emailVerifiedAt: null });
    users.findByEmail.mockResolvedValue(pending);
    await service.register({
      email: 'sofia@example.com',
      password: 'Secret@123',
      firstName: 'New',
      lastName: 'Name',
    });
    expect(users.create).not.toHaveBeenCalled();
    expect(users.updateUnverifiedRegistration).toHaveBeenCalledWith(
      pending,
      expect.objectContaining({ firstName: 'New', password: 'Secret@123' }),
    );
    expect(otp.issue).toHaveBeenCalledWith(pending, OtpPurpose.VerifyEmail, {
      respectCooldown: true,
    });
  });

  it('refuses to log in an unverified account with EMAIL_NOT_VERIFIED and resends a code', async () => {
    users.findByEmailWithPassword.mockResolvedValue(
      makeUser({ emailVerifiedAt: null }),
    );
    users.verifyPassword.mockResolvedValue(true);
    const error = await service
      .login({ email: 'sofia@example.com', password: 'good' })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ForbiddenException);
    expect((error as ForbiddenException).getResponse()).toMatchObject({
      statusCode: 403,
      code: 'EMAIL_NOT_VERIFIED',
      email: 'sofia@example.com',
    });
    expect(otp.issue).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'user-1' }),
      OtpPurpose.VerifyEmail,
      { respectCooldown: true },
    );
    expect(tokens.issueRefreshToken).not.toHaveBeenCalled();
  });

  it('verifies the email with a valid code and signs the user in', async () => {
    users.findByEmail.mockResolvedValue(makeUser({ emailVerifiedAt: null }));
    const result = await service.verifyEmail({
      email: 'sofia@example.com',
      code: '123456',
    });
    expect(otp.verify).toHaveBeenCalledWith(
      'user-1',
      OtpPurpose.VerifyEmail,
      '123456',
    );
    expect(result.user.emailVerified).toBe(true);
    expect(result.accessToken).toBe('access');
  });

  it('answers resend/forgot requests identically for unknown, verified and inactive accounts', async () => {
    users.findByEmail.mockResolvedValue(null);
    const unknown = await service.forgotPassword('ghost@example.com');
    users.findByEmail.mockResolvedValue(makeUser());
    const verified = await service.resendOtp({
      email: 'sofia@example.com',
      purpose: OtpPurpose.VerifyEmail,
    });
    users.findByEmail.mockResolvedValue(makeUser({ isActive: false }));
    await service.forgotPassword('sofia@example.com');
    expect(otp.issue).not.toHaveBeenCalled();
    expect(unknown.purpose).toBe(OtpPurpose.ResetPassword);
    expect(verified.purpose).toBe(OtpPurpose.VerifyEmail);
  });

  it('resets the password with a code, verifies the email and revokes all sessions', async () => {
    users.findByEmail.mockResolvedValue(null);
    await expect(
      service.resetPassword({
        email: 'ghost@example.com',
        code: '123456',
        newPassword: 'New@12345',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    users.findByEmail.mockResolvedValue(makeUser({ emailVerifiedAt: null }));
    await service.resetPassword({
      email: 'sofia@example.com',
      code: '123456',
      newPassword: 'New@12345',
    });
    expect(otp.verify).toHaveBeenCalledWith(
      'user-1',
      OtpPurpose.ResetPassword,
      '123456',
    );
    expect(users.updatePassword).toHaveBeenCalledWith('user-1', 'New@12345');
    expect(users.markEmailVerified).toHaveBeenCalled();
    expect(tokens.revokeAllForUser).toHaveBeenCalledWith('user-1');
  });

  it('still runs a password hash comparison for unknown emails (timing equalisation)', async () => {
    users.findByEmailWithPassword.mockResolvedValue(null);
    const hashSpy = vi
      .spyOn(UsersService, 'hashPassword')
      .mockResolvedValue('dummy');
    await expect(
      service.login({ email: 'ghost@example.com', password: 'x' }),
    ).rejects.toThrow('Invalid email or password');
    expect(users.verifyPassword).toHaveBeenCalledWith(
      { passwordHash: 'dummy' },
      'x',
    );
    hashSpy.mockRestore();
  });

  it('rejects wrong passwords and inactive accounts with the same error', async () => {
    users.findByEmailWithPassword.mockResolvedValue(makeUser());
    users.verifyPassword.mockResolvedValue(false);
    await expect(
      service.login({ email: 'sofia@example.com', password: 'bad' }),
    ).rejects.toThrow('Invalid email or password');

    users.findByEmailWithPassword.mockResolvedValue(
      makeUser({ isActive: false }),
    );
    users.verifyPassword.mockResolvedValue(true);
    await expect(
      service.login({ email: 'sofia@example.com', password: 'good' }),
    ).rejects.toThrow('Invalid email or password');
  });

  it('issues tokens on a valid login', async () => {
    users.findByEmailWithPassword.mockResolvedValue(makeUser());
    users.verifyPassword.mockResolvedValue(true);
    await expect(
      service.login({ email: 'sofia@example.com', password: 'good' }),
    ).resolves.toMatchObject({ accessToken: 'access' });
  });

  it('revokes all sessions when refreshing for a deactivated user', async () => {
    (tokens.rotate as ReturnType<typeof vi.fn>).mockResolvedValue({
      userId: 'user-1',
      refreshToken: 'next',
    });
    users.findById.mockResolvedValue(makeUser({ isActive: false }));
    await expect(service.refresh('old')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(tokens.revokeAllForUser).toHaveBeenCalledWith('user-1');
  });

  it('returns rotated tokens on refresh', async () => {
    (tokens.rotate as ReturnType<typeof vi.fn>).mockResolvedValue({
      userId: 'user-1',
      refreshToken: 'next',
    });
    users.findById.mockResolvedValue(makeUser());
    await expect(service.refresh('old')).resolves.toMatchObject({
      refreshToken: 'next',
      accessToken: 'access',
    });
  });

  it('changes password only with the correct current password and revokes sessions', async () => {
    users.findByIdWithPassword.mockResolvedValue(makeUser());
    users.verifyPassword.mockResolvedValue(false);
    await expect(
      service.changePassword('user-1', {
        currentPassword: 'x',
        newPassword: 'New@12345',
      }),
    ).rejects.toThrow('Current password is incorrect');
    expect(users.updatePassword).not.toHaveBeenCalled();

    users.verifyPassword.mockResolvedValue(true);
    await service.changePassword('user-1', {
      currentPassword: 'right',
      newPassword: 'New@12345',
    });
    expect(users.updatePassword).toHaveBeenCalledWith('user-1', 'New@12345');
    expect(tokens.revokeAllForUser).toHaveBeenCalledWith('user-1');
  });
});
