import sharp from 'sharp';

export const IMAGE_RENDITIONS = [
  { name: 'lg', width: 1200 },
  { name: 'md', width: 600 },
  { name: 'sm', width: 200 },
] as const;

export type RenditionName = (typeof IMAGE_RENDITIONS)[number]['name'];

const ACCEPTED_FORMATS = new Set(['jpeg', 'png', 'webp', 'avif']);
/** Rejects decompression bombs before any pixel data is allocated. */
const MAX_INPUT_PIXELS = 40_000_000;

export class InvalidImageError extends Error {}

/**
 * Validates the upload by decoding it (the client-supplied MIME type is never trusted)
 * and produces WebP renditions at fixed widths, stripping EXIF metadata.
 */
export async function processImage(
  input: Buffer,
): Promise<Record<RenditionName, Buffer>> {
  let format: string | undefined;
  try {
    format = (
      await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS }).metadata()
    ).format;
  } catch {
    throw new InvalidImageError('File is not a valid image');
  }
  if (!format || !ACCEPTED_FORMATS.has(format)) {
    throw new InvalidImageError(
      'Only JPEG, PNG, WebP or AVIF images are allowed',
    );
  }

  const entries = await Promise.all(
    IMAGE_RENDITIONS.map(async ({ name, width }) => {
      const buffer = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS })
        .rotate()
        .resize({ width, withoutEnlargement: true })
        .webp({ quality: 80 })
        .toBuffer();
      return [name, buffer] as const;
    }),
  );
  return Object.fromEntries(entries) as Record<RenditionName, Buffer>;
}
