import { createHmac, timingSafeEqual } from 'node:crypto';

export const hmacSha256 = (secret: string, data: string | Buffer): string =>
  createHmac('sha256', secret).update(data).digest('hex');

/** Constant-time comparison of hex signatures. */
export function safeEqualHex(expected: string, actual: string): boolean {
  if (!/^[0-9a-f]+$/i.test(actual) || expected.length !== actual.length)
    return false;
  return timingSafeEqual(
    Buffer.from(expected, 'hex'),
    Buffer.from(actual, 'hex'),
  );
}
