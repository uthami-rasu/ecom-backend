import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalStorageService } from './local-storage.service.js';

describe('LocalStorageService', () => {
  let dir: string;
  let storage: LocalStorageService;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'storage-'));
    storage = new LocalStorageService(dir, 'https://cdn.example.com');
  });
  afterEach(() => rm(dir, { recursive: true, force: true }));

  it('writes files and returns public URLs', async () => {
    const url = await storage.put('products/abc-lg.webp', Buffer.from('x'));
    expect(url).toBe('https://cdn.example.com/uploads/products/abc-lg.webp');
    expect(await readFile(join(dir, 'products/abc-lg.webp'), 'utf8')).toBe('x');
  });

  it('deletes all renditions sharing a prefix', async () => {
    await storage.put('products/abc-lg.webp', Buffer.from('1'));
    await storage.put('products/abc-sm.webp', Buffer.from('2'));
    await storage.put('products/xyz-lg.webp', Buffer.from('3'));
    await storage.deletePrefix('products/abc-');
    expect(await readdir(join(dir, 'products'))).toEqual(['xyz-lg.webp']);
  });

  it('refuses keys that escape the upload directory', async () => {
    await expect(
      storage.put('../escape.txt', Buffer.from('x')),
    ).rejects.toThrow('Invalid storage key');
    await expect(storage.delete('../../etc/passwd')).rejects.toThrow(
      'Invalid storage key',
    );
  });
});
