import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import type { StorageService } from './storage.interface.js';

export class LocalStorageService implements StorageService {
  private readonly root: string;

  constructor(
    uploadDir: string,
    private readonly publicBaseUrl: string,
  ) {
    this.root = resolve(uploadDir);
  }

  async put(key: string, body: Buffer, _contentType?: string): Promise<string> {
    const path = this.resolveKey(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, body);
    return `${this.publicBaseUrl}/uploads/${key}`;
  }

  async delete(key: string): Promise<void> {
    await rm(this.resolveKey(key), { force: true });
  }

  async deletePrefix(prefix: string): Promise<void> {
    const dir = dirname(this.resolveKey(prefix));
    const base = prefix.split('/').pop() ?? '';
    const entries = await readdir(dir).catch(() => [] as string[]);
    await Promise.all(
      entries
        .filter((name) => name.startsWith(base))
        .map((name) => rm(join(dir, name), { force: true })),
    );
  }

  /** Keys are generated server-side, but guard against path traversal regardless. */
  private resolveKey(key: string): string {
    const path = resolve(this.root, key);
    if (!path.startsWith(this.root + sep))
      throw new Error('Invalid storage key');
    return path;
  }
}
