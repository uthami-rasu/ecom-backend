import { ServiceUnavailableException } from '@nestjs/common';
import { createHmac } from 'node:crypto';
import { FindOperator } from 'typeorm';
import type { MailMessage } from '../mail/mail.service.js';
import { EmailOtp, OtpPurpose } from './entities/email-otp.entity.js';
import {
  generateOtpCode,
  INVALID_CODE,
  OtpService,
  TOO_MANY_ATTEMPTS,
} from './otp.service.js';

const SECRET = 'unit-test-secret-that-is-long-enough-123';
const user = { id: 'user-1', email: 'sofia@example.com', firstName: 'Sofia' };

type Row = EmailOtp;

const matches = (row: Row, where: Record<string, unknown>) =>
  Object.entries(where).every(([key, expected]) => {
    const actual = row[key as keyof Row];
    if (expected instanceof FindOperator) {
      if (expected.type === 'isNull') return actual === null;
      if (expected.type === 'moreThan')
        return (actual as Date).getTime() > (expected.value as Date).getTime();
      throw new Error(`Unsupported operator ${expected.type}`);
    }
    return actual === expected;
  });

/** Minimal in-memory stand-in for Repository<EmailOtp>. */
function fakeRepository() {
  const rows: Row[] = [];
  let sequence = 0;
  const find = (where: Record<string, unknown>) =>
    rows
      .filter((row) => matches(row, where))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  return {
    rows,
    create: (data: Partial<Row>) => ({ ...data }) as Row,
    save: vi.fn(async (data: Partial<Row>) => {
      const row = {
        ...data,
        id: `otp-${++sequence}`,
        attempts: 0,
        consumedAt: null,
        createdAt: new Date(),
      } as Row;
      rows.push(row);
      return row;
    }),
    findOne: vi.fn(
      async ({ where }: { where: Record<string, unknown> }) =>
        find(where)[0] ?? null,
    ),
    update: vi.fn(
      async (where: Record<string, unknown>, changes: Partial<Row>) => {
        const hit = find(where);
        for (const row of hit) Object.assign(row, changes);
        return { affected: hit.length };
      },
    ),
    delete: vi.fn(async ({ id }: { id: string }) => {
      rows.splice(
        rows.findIndex((row) => row.id === id),
        1,
      );
    }),
    // update().set({ attempts: attempts + 1 }).where(id, not consumed).returning().execute()
    createQueryBuilder: () => {
      let id = '';
      const chain = {
        update: () => chain,
        set: () => chain,
        where: (_sql: string, params: { id: string }) => {
          id = params.id;
          return chain;
        },
        returning: () => chain,
        execute: async () => {
          const row = rows.find((r) => r.id === id && r.consumedAt === null);
          if (!row) return { raw: [] };
          row.attempts += 1;
          return { raw: [{ attempts: row.attempts }] };
        },
      };
      return chain;
    },
  };
}

describe('OtpService', () => {
  let repo: ReturnType<typeof fakeRepository>;
  let mail: { send: ReturnType<typeof vi.fn> };
  let service: OtpService;

  const sentCodes = () =>
    mail.send.mock.calls.map(
      (call) => /Your code: (\d{6})/.exec((call[0] as MailMessage).text)![1],
    );
  const lastCode = () => sentCodes().at(-1)!;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-15T10:00:00Z'));
    repo = fakeRepository();
    mail = { send: vi.fn(async () => undefined) };
    const config = {
      get: (key: string) =>
        key === 'auth.accessSecret'
          ? SECRET
          : { ttlSeconds: 600, resendSeconds: 60, maxAttempts: 3 },
    };
    service = new OtpService(repo as never, mail as never, config as never);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('generates zero-padded six digit codes', () => {
    for (let i = 0; i < 200; i += 1)
      expect(generateOtpCode()).toMatch(/^\d{6}$/);
  });

  it('emails the code but stores only its HMAC', async () => {
    await expect(service.issue(user, OtpPurpose.VerifyEmail)).resolves.toBe(
      true,
    );
    const code = lastCode();
    const [row] = repo.rows;
    expect(row.codeHash).toBe(
      createHmac('sha256', SECRET).update(code).digest('hex'),
    );
    expect(row.codeHash).not.toContain(code);
    expect(row).toMatchObject({
      userId: 'user-1',
      email: 'sofia@example.com',
      purpose: OtpPurpose.VerifyEmail,
    });
    expect(row.expiresAt.getTime() - Date.now()).toBe(600_000);
    expect(mail.send).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'sofia@example.com' }),
    );
  });

  it('sends change-email codes to the new address', async () => {
    await service.issue(user, OtpPurpose.ChangeEmail, {
      email: 'new@example.com',
    });
    expect(repo.rows[0].email).toBe('new@example.com');
    expect(mail.send.mock.calls[0][0].to).toBe('new@example.com');
  });

  it('accepts a valid code exactly once', async () => {
    await service.issue(user, OtpPurpose.VerifyEmail);
    const code = lastCode();
    await expect(
      service.verify('user-1', OtpPurpose.VerifyEmail, code),
    ).resolves.toMatchObject({ email: 'sofia@example.com' });
    await expect(
      service.verify('user-1', OtpPurpose.VerifyEmail, code),
    ).rejects.toThrow(INVALID_CODE);
  });

  it('does not accept a code for another purpose', async () => {
    await service.issue(user, OtpPurpose.ResetPassword);
    await expect(
      service.verify('user-1', OtpPurpose.VerifyEmail, lastCode()),
    ).rejects.toThrow(INVALID_CODE);
  });

  it('rejects expired codes', async () => {
    await service.issue(user, OtpPurpose.VerifyEmail);
    vi.setSystemTime(Date.now() + 601_000);
    await expect(
      service.verify('user-1', OtpPurpose.VerifyEmail, lastCode()),
    ).rejects.toThrow(INVALID_CODE);
  });

  it('burns the code when the maximum number of attempts is reached', async () => {
    await service.issue(user, OtpPurpose.VerifyEmail);
    const code = lastCode();
    const wrong = code === '000000' ? '111111' : '000000';

    await expect(
      service.verify('user-1', OtpPurpose.VerifyEmail, wrong),
    ).rejects.toThrow(INVALID_CODE);
    await expect(
      service.verify('user-1', OtpPurpose.VerifyEmail, wrong),
    ).rejects.toThrow(INVALID_CODE);
    await expect(
      service.verify('user-1', OtpPurpose.VerifyEmail, wrong),
    ).rejects.toThrow(TOO_MANY_ATTEMPTS);
    expect(repo.rows[0].consumedAt).not.toBeNull();
    // Even the right code no longer works.
    await expect(
      service.verify('user-1', OtpPurpose.VerifyEmail, code),
    ).rejects.toThrow(INVALID_CODE);
  });

  it('invalidates older codes when a new one is issued', async () => {
    await service.issue(user, OtpPurpose.VerifyEmail);
    vi.setSystemTime(Date.now() + 1000);
    await service.issue(user, OtpPurpose.VerifyEmail);
    const [first, second] = sentCodes();
    expect(repo.rows[0].consumedAt).not.toBeNull();
    if (first !== second)
      await expect(
        service.verify('user-1', OtpPurpose.VerifyEmail, first),
      ).rejects.toThrow(INVALID_CODE);
    await expect(
      service.verify('user-1', OtpPurpose.VerifyEmail, second),
    ).resolves.toBeDefined();
  });

  it('honours the resend cooldown only when asked to', async () => {
    await service.issue(user, OtpPurpose.VerifyEmail);
    vi.setSystemTime(Date.now() + 30_000);
    await expect(
      service.issue(user, OtpPurpose.VerifyEmail, { respectCooldown: true }),
    ).resolves.toBe(false);
    expect(mail.send).toHaveBeenCalledTimes(1);

    vi.setSystemTime(Date.now() + 31_000);
    await expect(
      service.issue(user, OtpPurpose.VerifyEmail, { respectCooldown: true }),
    ).resolves.toBe(true);
    await expect(service.issue(user, OtpPurpose.VerifyEmail)).resolves.toBe(
      true,
    );
    expect(mail.send).toHaveBeenCalledTimes(3);
  });

  it('discards the code when the email cannot be sent', async () => {
    mail.send.mockRejectedValue(new ServiceUnavailableException('down'));
    await expect(
      service.issue(user, OtpPurpose.VerifyEmail),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(repo.rows).toHaveLength(0);
  });

  it('describes the challenge without revealing anything account specific', () => {
    expect(
      service.challenge('anyone@example.com', OtpPurpose.ResetPassword),
    ).toEqual({
      email: 'anyone@example.com',
      purpose: OtpPurpose.ResetPassword,
      expiresInSeconds: 600,
      resendAfterSeconds: 60,
    });
  });
});
