import { UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { JwtService } from '@nestjs/jwt';
import { hashToken, TokenService } from './token.service.js';

describe('TokenService', () => {
  let repo: Record<string, ReturnType<typeof vi.fn>>;
  let service: TokenService;
  const config = {
    get: () => ({ accessTtlSeconds: 900, refreshTtlDays: 30 }),
  } as unknown as ConfigService;
  const signAsync = vi.fn(async () => 'jwt');
  const jwt = { signAsync } as unknown as JwtService;

  beforeEach(() => {
    repo = {
      insert: vi.fn(),
      findOneBy: vi.fn(),
      update: vi.fn(async () => ({ affected: 1 })),
    };
    service = new TokenService(jwt, repo as never, config as never);
  });

  it('stores only the SHA-256 hash of new refresh tokens', async () => {
    const token = await service.issueRefreshToken('user-1');
    expect(token.length).toBeGreaterThanOrEqual(60);
    const stored = repo.insert.mock.calls[0][0];
    expect(stored.tokenHash).toBe(hashToken(token));
    expect(stored.tokenHash).not.toContain(token);
    expect(stored.expiresAt.getTime()).toBeGreaterThan(
      Date.now() + 29 * 24 * 3600 * 1000,
    );
  });

  it('signs access tokens with a typed payload', async () => {
    await service.signAccessToken({
      id: 'u',
      email: 'e@x.co',
      role: 'customer' as never,
    });
    expect(signAsync).toHaveBeenCalledWith({
      sub: 'u',
      email: 'e@x.co',
      role: 'customer',
      typ: 'access',
    });
  });

  it('rejects unknown and expired tokens', async () => {
    repo.findOneBy.mockResolvedValue(null);
    await expect(service.rotate('nope')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );

    repo.findOneBy.mockResolvedValue({
      id: 't',
      familyId: 'f',
      userId: 'u',
      revokedAt: null,
      expiresAt: new Date(Date.now() - 1),
    });
    await expect(service.rotate('old')).rejects.toThrow(
      'Refresh token expired',
    );
  });

  it('revokes the whole family when a rotated token is replayed', async () => {
    repo.findOneBy.mockResolvedValue({
      id: 't',
      familyId: 'family-1',
      userId: 'u',
      revokedAt: new Date(),
      expiresAt: new Date(Date.now() + 1e6),
    });
    await expect(service.rotate('replayed')).rejects.toThrow(
      'already been used',
    );
    expect(repo.update).toHaveBeenCalledWith(
      expect.objectContaining({ familyId: 'family-1' }),
      expect.any(Object),
    );
  });

  it('treats losing a concurrent rotation race as reuse', async () => {
    repo.findOneBy.mockResolvedValue({
      id: 't',
      familyId: 'family-1',
      userId: 'u',
      revokedAt: null,
      expiresAt: new Date(Date.now() + 1e6),
    });
    repo.update.mockResolvedValueOnce({ affected: 0 });
    await expect(service.rotate('raced')).rejects.toThrow('already been used');
  });

  it('rotates a valid token within the same family', async () => {
    repo.findOneBy.mockResolvedValue({
      id: 't',
      familyId: 'family-1',
      userId: 'u',
      revokedAt: null,
      expiresAt: new Date(Date.now() + 1e6),
    });
    const result = await service.rotate('valid');
    expect(result.userId).toBe('u');
    expect(repo.insert).toHaveBeenCalledWith(
      expect.objectContaining({ familyId: 'family-1', userId: 'u' }),
    );
  });
});
