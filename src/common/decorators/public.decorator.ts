import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/** Opts a route out of the global JWT guard. A valid token is still decoded if present. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
