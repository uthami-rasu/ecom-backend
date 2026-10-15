import {
  ForbiddenException,
  UnauthorizedException,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Role } from '../enums/role.enum.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { RolesGuard } from './roles.guard.js';

const secret = 'unit-test-secret-unit-test-secret-123';
const jwt = new JwtService({
  secret,
  signOptions: { algorithm: 'HS256', expiresIn: 60 },
});

function context(request: Record<string, unknown>): ExecutionContext {
  return {
    getHandler: () => () => undefined,
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

const reflectorReturning = (value: unknown) =>
  ({ getAllAndOverride: () => value }) as unknown as Reflector;

describe('JwtAuthGuard', () => {
  it('rejects requests without a token on protected routes', async () => {
    const guard = new JwtAuthGuard(reflectorReturning(false), jwt);
    await expect(
      guard.canActivate(context({ headers: {} })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('allows public routes without a token', async () => {
    const guard = new JwtAuthGuard(reflectorReturning(true), jwt);
    await expect(guard.canActivate(context({ headers: {} }))).resolves.toBe(
      true,
    );
  });

  it('attaches the user for a valid access token', async () => {
    const token = await jwt.signAsync({
      sub: 'u1',
      email: 'a@b.co',
      role: Role.Admin,
      typ: 'access',
    });
    const request: Record<string, unknown> = {
      headers: { authorization: `Bearer ${token}` },
    };
    await new JwtAuthGuard(reflectorReturning(false), jwt).canActivate(
      context(request),
    );
    expect(request.user).toEqual({
      id: 'u1',
      email: 'a@b.co',
      role: Role.Admin,
    });
  });

  it('rejects tokens of the wrong type or with an unknown role', async () => {
    const guard = new JwtAuthGuard(reflectorReturning(false), jwt);
    for (const payload of [
      { sub: 'u1', email: 'a@b.co', role: Role.Customer, typ: 'refresh' },
      { sub: 'u1', email: 'a@b.co', role: 'superuser', typ: 'access' },
    ]) {
      const token = await jwt.signAsync(payload);
      await expect(
        guard.canActivate(
          context({ headers: { authorization: `Bearer ${token}` } }),
        ),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    }
  });

  it('ignores an invalid token on public routes instead of failing', async () => {
    const guard = new JwtAuthGuard(reflectorReturning(true), jwt);
    const request: Record<string, unknown> = {
      headers: { authorization: 'Bearer broken' },
    };
    await expect(guard.canActivate(context(request))).resolves.toBe(true);
    expect(request.user).toBeUndefined();
  });
});

describe('RolesGuard', () => {
  it('passes when no roles are required', () => {
    expect(
      new RolesGuard(reflectorReturning(undefined)).canActivate(context({})),
    ).toBe(true);
  });

  it('allows matching roles and forbids others', () => {
    const guard = new RolesGuard(reflectorReturning([Role.Admin]));
    expect(guard.canActivate(context({ user: { role: Role.Admin } }))).toBe(
      true,
    );
    expect(() =>
      guard.canActivate(context({ user: { role: Role.Customer } })),
    ).toThrow(ForbiddenException);
    expect(() => guard.canActivate(context({}))).toThrow(ForbiddenException);
  });
});
