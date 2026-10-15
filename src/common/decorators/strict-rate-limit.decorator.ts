import { SetMetadata } from '@nestjs/common';

export const STRICT_RATE_LIMIT_KEY = 'strictRateLimit';

/** Applies the tighter "auth" throttler (login, register, contact forms). */
export const StrictRateLimit = () => SetMetadata(STRICT_RATE_LIMIT_KEY, true);
