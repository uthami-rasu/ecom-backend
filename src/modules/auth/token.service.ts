import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { IsNull, Repository } from 'typeorm';
import type { AppConfig } from '../../config/configuration.js';
import type { User } from '../users/entities/user.entity.js';
import { RefreshToken } from './entities/refresh-token.entity.js';

const DAY_MS = 24 * 60 * 60 * 1000;

export const hashToken = (token: string) =>
  createHash('sha256').update(token).digest('hex');

@Injectable()
export class TokenService {
  private readonly refreshTtlMs: number;
  readonly accessTtlSeconds: number;

  constructor(
    private readonly jwt: JwtService,
    @InjectRepository(RefreshToken)
    private readonly tokens: Repository<RefreshToken>,
    config: ConfigService<AppConfig, true>,
  ) {
    const auth = config.get('auth', { infer: true });
    this.refreshTtlMs = auth.refreshTtlDays * DAY_MS;
    this.accessTtlSeconds = auth.accessTtlSeconds;
  }

  signAccessToken(user: Pick<User, 'id' | 'email' | 'role'>): Promise<string> {
    return this.jwt.signAsync({
      sub: user.id,
      email: user.email,
      role: user.role,
      typ: 'access',
    });
  }

  /** Issues an opaque refresh token; only its hash is persisted. */
  async issueRefreshToken(
    userId: string,
    familyId: string = randomUUID(),
  ): Promise<string> {
    const token = randomBytes(48).toString('base64url');
    await this.tokens.insert({
      userId,
      familyId,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + this.refreshTtlMs),
    });
    return token;
  }

  /**
   * Rotates a refresh token. Presenting a token that was already rotated is treated
   * as theft: the whole token family is revoked and the caller must log in again.
   */
  async rotate(
    token: string,
  ): Promise<{ userId: string; refreshToken: string }> {
    const stored = await this.tokens.findOneBy({ tokenHash: hashToken(token) });
    if (!stored) throw new UnauthorizedException('Invalid refresh token');

    if (stored.revokedAt) {
      await this.revokeFamily(stored.familyId);
      throw new UnauthorizedException('Refresh token has already been used');
    }
    if (stored.expiresAt.getTime() <= Date.now())
      throw new UnauthorizedException('Refresh token expired');

    // Conditional update makes concurrent refreshes with the same token race-safe.
    const result = await this.tokens.update(
      { id: stored.id, revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
    if (!result.affected) {
      await this.revokeFamily(stored.familyId);
      throw new UnauthorizedException('Refresh token has already been used');
    }
    return {
      userId: stored.userId,
      refreshToken: await this.issueRefreshToken(
        stored.userId,
        stored.familyId,
      ),
    };
  }

  async revoke(token: string): Promise<void> {
    const stored = await this.tokens.findOneBy({ tokenHash: hashToken(token) });
    if (stored) await this.revokeFamily(stored.familyId);
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.tokens.update(
      { userId, revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
  }

  private async revokeFamily(familyId: string): Promise<void> {
    await this.tokens.update(
      { familyId, revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
  }
}
