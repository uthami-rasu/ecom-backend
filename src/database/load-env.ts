import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

/** Loads .env (or .env.test under NODE_ENV=test) for scripts that run outside Nest. */
export function loadEnvFile(): void {
  const file = resolve(
    process.cwd(),
    process.env.NODE_ENV === 'test' ? '.env.test' : '.env',
  );
  if (existsSync(file)) process.loadEnvFile(file);
}
