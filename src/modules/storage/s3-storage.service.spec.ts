import { describe, expect, it, vi } from 'vitest';
import { S3StorageService } from './s3-storage.service.js';

describe('S3StorageService', () => {
  const config = {
    endpoint: 'https://example.supabase.co/storage/v1/s3',
    region: 'ap-southeast-1',
    bucket: 'test-bucket',
    accessKeyId: 'test-key',
    secretAccessKey: 'test-secret',
    publicBaseUrl: 'https://example.supabase.co/storage/v1/object/public/test-bucket',
    forcePathStyle: true,
  };

  it('puts an object and returns the public URL', async () => {
    const service = new S3StorageService(config);
    const sendSpy = vi
      .spyOn((service as unknown as { client: { send: (cmd: unknown) => Promise<unknown> } }).client, 'send')
      .mockResolvedValue({});

    const url = await service.put('products/item.webp', Buffer.from('image'), 'image/webp');
    expect(url).toBe('https://example.supabase.co/storage/v1/object/public/test-bucket/products/item.webp');
    expect(sendSpy).toHaveBeenCalledTimes(1);
  });

  it('deletes an object', async () => {
    const service = new S3StorageService(config);
    const sendSpy = vi
      .spyOn((service as unknown as { client: { send: (cmd: unknown) => Promise<unknown> } }).client, 'send')
      .mockResolvedValue({});

    await service.delete('products/item.webp');
    expect(sendSpy).toHaveBeenCalledTimes(1);
  });

  it('deletes objects matching prefix', async () => {
    const service = new S3StorageService(config);
    const sendSpy = vi
      .spyOn((service as unknown as { client: { send: (cmd: unknown) => Promise<unknown> } }).client, 'send')
      .mockImplementation(async (cmd: unknown) => {
        const commandName = (cmd as { constructor: { name: string } }).constructor.name;
        if (commandName === 'ListObjectsV2Command') {
          return {
            Contents: [{ Key: 'products/123-lg.webp' }, { Key: 'products/123-sm.webp' }],
            NextContinuationToken: undefined,
          };
        }
        return {};
      });

    await service.deletePrefix('products/123-');
    expect(sendSpy).toHaveBeenCalledTimes(2); // 1 list + 1 delete
  });
});
