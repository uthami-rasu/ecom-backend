import sharp from 'sharp';
import { InvalidImageError, processImage } from './image-processing.js';

describe('processImage', () => {
  it('produces three WebP renditions without upscaling', async () => {
    const input = await sharp({
      create: { width: 800, height: 600, channels: 3, background: '#d6941a' },
    })
      .jpeg()
      .toBuffer();
    const renditions = await processImage(input);
    const widths = await Promise.all(
      Object.values(renditions).map(async (buffer) => {
        const meta = await sharp(buffer).metadata();
        expect(meta.format).toBe('webp');
        return meta.width;
      }),
    );
    expect(widths).toEqual([800, 600, 200]);
  });

  it('rejects non-images and unsupported formats', async () => {
    await expect(
      processImage(Buffer.from('definitely not an image')),
    ).rejects.toBeInstanceOf(InvalidImageError);
    const gif = await sharp({
      create: { width: 10, height: 10, channels: 3, background: '#000' },
    })
      .gif()
      .toBuffer();
    await expect(processImage(gif)).rejects.toThrow(
      'Only JPEG, PNG, WebP or AVIF images are allowed',
    );
  });
});
