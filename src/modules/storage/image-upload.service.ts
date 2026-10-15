import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { InvalidImageError, processImage } from './image-processing.js';
import { STORAGE_SERVICE, type StorageService } from './storage.interface.js';

export interface StoredImage {
  url: string;
  mediumUrl: string;
  thumbUrl: string;
  /** Prefix shared by all renditions; used to delete them together. */
  storageKey: string;
}

@Injectable()
export class ImageUploadService {
  constructor(
    @Inject(STORAGE_SERVICE) private readonly storage: StorageService,
  ) {}

  async upload(
    folder: 'products' | 'categories' | 'avatars',
    file: Express.Multer.File | undefined,
  ): Promise<StoredImage> {
    if (!file?.buffer?.length)
      throw new BadRequestException(
        'An image file is required (field "image")',
      );

    let renditions: Awaited<ReturnType<typeof processImage>>;
    try {
      renditions = await processImage(file.buffer);
    } catch (error) {
      if (error instanceof InvalidImageError)
        throw new BadRequestException(error.message);
      throw error;
    }

    const storageKey = `${folder}/${randomUUID()}`;
    const [url, mediumUrl, thumbUrl] = await Promise.all([
      this.storage.put(`${storageKey}-lg.webp`, renditions.lg, 'image/webp'),
      this.storage.put(`${storageKey}-md.webp`, renditions.md, 'image/webp'),
      this.storage.put(`${storageKey}-sm.webp`, renditions.sm, 'image/webp'),
    ]);
    return { url, mediumUrl, thumbUrl, storageKey };
  }

  async remove(storageKey: string | null | undefined): Promise<void> {
    if (storageKey) await this.storage.deletePrefix(`${storageKey}-`);
  }
}
