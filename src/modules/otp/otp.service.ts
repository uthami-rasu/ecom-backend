import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { IsNull, MoreThan, Repository } from 'typeorm';
import type { AppConfig } from '../../config/configuration.js';
import { MailService } from '../mail/mail.service.js';
import { otpMail } from '../mail/mail.templates.js';
import { EmailOtp, OtpPurpose } from './entities/email-otp.entity.js';

export const INVALID_CODE = 'Invalid or expired code';
export const TOO_MANY_ATTEMPTS = 'Too many attempts. Request a new code.';

export interface OtpChallenge {
  email: string;
  purpose: OtpPurpose;
  expiresInSeconds: number;
  resendAfterSeconds: number;
}

export interface OtpRecipient {
  id: string;
  email: string;
  firstName: string;
}

/** Six random digits, zero-padded (000000–999999). */
export const generateOtpCode = (): string =>
  randomInt(0, 1_000_000).toString().padStart(6, '0');

@Injectable()
export class OtpService {
  private readonly secret: string;
  private readonly settings: AppConfig['otp'];

  constructor(
    @InjectRepository(EmailOtp) private readonly otps: Repository<EmailOtp>,
    private readonly mail: MailService,
    config: ConfigService<AppConfig, true>,
  ) {
    this.secret = config.get('auth.accessSecret', { infer: true });
    this.settings = config.get('otp', { infer: true });
  }

  hashCode(code: string): string {
    return createHmac('sha256', this.secret).update(code).digest('hex');
  }

  /** What the client is told after a code was (or, to avoid enumeration, seemingly was) sent. */
  challenge(email: string, purpose: OtpPurpose): OtpChallenge {
    return {
      email,
      purpose,
      expiresInSeconds: this.settings.ttlSeconds,
      resendAfterSeconds: this.settings.resendSeconds,
    };
  }

  /**
   * Emails a fresh code and invalidates older unused codes for the same purpose.
   * With `respectCooldown`, nothing is sent while the previous code is younger than
   * OTP_RESEND_SECONDS. Returns whether a code was sent. Delivery is awaited: a mail
   * failure becomes a 503 and the unsent code is discarded.
   */
  async issue(
    user: OtpRecipient,
    purpose: OtpPurpose,
    options: { email?: string; respectCooldown?: boolean } = {},
  ): Promise<boolean> {
    if (options.respectCooldown && (await this.inCooldown(user.id, purpose)))
      return false;

    const email = options.email ?? user.email;
    const code = generateOtpCode();
    await this.otps.update(
      { userId: user.id, purpose, consumedAt: IsNull() },
      { consumedAt: new Date() },
    );
    const saved = await this.otps.save(
      this.otps.create({
        userId: user.id,
        email,
        purpose,
        codeHash: this.hashCode(code),
        expiresAt: new Date(Date.now() + this.settings.ttlSeconds * 1000),
      }),
    );
    try {
      await this.mail.send({
        to: email,
        ...otpMail({
          purpose,
          code,
          firstName: user.firstName,
          ttlMinutes: Math.round(this.settings.ttlSeconds / 60),
        }),
      });
    } catch (error) {
      await this.otps.delete({ id: saved.id });
      throw error;
    }
    return true;
  }

  /**
   * Checks a code against the newest live code for the user and purpose and consumes it.
   * Every wrong guess counts; the guess that reaches OTP_MAX_ATTEMPTS burns the code.
   */
  async verify(
    userId: string,
    purpose: OtpPurpose,
    code: string,
  ): Promise<EmailOtp> {
    const otp = await this.otps.findOne({
      where: {
        userId,
        purpose,
        consumedAt: IsNull(),
        expiresAt: MoreThan(new Date()),
      },
      order: { createdAt: 'DESC' },
    });
    if (!otp) throw new BadRequestException(INVALID_CODE);
    if (otp.attempts >= this.settings.maxAttempts) {
      await this.burn(otp.id);
      throw new BadRequestException(TOO_MANY_ATTEMPTS);
    }

    if (this.matches(code, otp.codeHash)) {
      // Conditional update: a code can be redeemed exactly once, even concurrently.
      const result = await this.otps.update(
        { id: otp.id, consumedAt: IsNull() },
        { consumedAt: new Date() },
      );
      if (!result.affected) throw new BadRequestException(INVALID_CODE);
      return otp;
    }

    const result = await this.otps
      .createQueryBuilder()
      .update(EmailOtp)
      .set({ attempts: () => 'attempts + 1' })
      .where('id = :id AND consumed_at IS NULL', { id: otp.id })
      .returning(['attempts'])
      .execute();
    const attempts =
      (result.raw as Array<{ attempts: number }>)[0]?.attempts ??
      this.settings.maxAttempts;
    if (attempts >= this.settings.maxAttempts) {
      await this.burn(otp.id);
      throw new BadRequestException(TOO_MANY_ATTEMPTS);
    }
    throw new BadRequestException(INVALID_CODE);
  }

  private matches(code: string, storedHash: string): boolean {
    const actual = Buffer.from(this.hashCode(code), 'hex');
    const expected = Buffer.from(storedHash, 'hex');
    return (
      actual.length === expected.length && timingSafeEqual(actual, expected)
    );
  }

  private async inCooldown(
    userId: string,
    purpose: OtpPurpose,
  ): Promise<boolean> {
    const latest = await this.otps.findOne({
      where: { userId, purpose },
      order: { createdAt: 'DESC' },
    });
    return (
      !!latest &&
      Date.now() - latest.createdAt.getTime() <
        this.settings.resendSeconds * 1000
    );
  }

  private async burn(id: string): Promise<void> {
    await this.otps.update(
      { id, consumedAt: IsNull() },
      { consumedAt: new Date() },
    );
  }
}
