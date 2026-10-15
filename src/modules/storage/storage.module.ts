import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MulterModule } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { AppConfig } from '../../config/configuration.js';
import { ImageUploadService } from './image-upload.service.js';
import { LocalStorageService } from './local-storage.service.js';
import { STORAGE_SERVICE } from './storage.interface.js';

@Global()
@Module({
  imports: [
    MulterModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>) => ({
        storage: memoryStorage(),
        limits: {
          fileSize: config.get('uploads.maxBytes', { infer: true }),
          files: 1,
          fields: 5,
        },
      }),
    }),
  ],
  providers: [
    {
      provide: STORAGE_SERVICE,
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>) => {
        const uploads = config.get('uploads', { infer: true });
        return new LocalStorageService(uploads.dir, uploads.publicBaseUrl);
      },
    },
    ImageUploadService,
  ],
  exports: [STORAGE_SERVICE, ImageUploadService, MulterModule],
})
export class StorageModule {}
