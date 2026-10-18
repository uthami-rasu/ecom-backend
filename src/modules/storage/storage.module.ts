import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MulterModule } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { AppConfig } from '../../config/configuration.js';
import { ImageUploadService } from './image-upload.service.js';
import { LocalStorageService } from './local-storage.service.js';
import { S3StorageService } from './s3-storage.service.js';
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
        if (
          uploads.driver === 's3' &&
          uploads.s3?.bucket &&
          uploads.s3.accessKeyId
        ) {
          return new S3StorageService({
            endpoint: uploads.s3.endpoint,
            region: uploads.s3.region,
            bucket: uploads.s3.bucket,
            accessKeyId: uploads.s3.accessKeyId,
            secretAccessKey: uploads.s3.secretAccessKey,
            publicBaseUrl: uploads.s3.publicBaseUrl,
            forcePathStyle: uploads.s3.forcePathStyle,
          });
        }
        return new LocalStorageService(uploads.dir, uploads.publicBaseUrl);
      },
    },
    ImageUploadService,
  ],
  exports: [STORAGE_SERVICE, ImageUploadService, MulterModule],
})
export class StorageModule {}
