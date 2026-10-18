import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import type { StorageService } from './storage.interface.js';

export interface S3StorageConfig {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  publicBaseUrl: string;
  forcePathStyle?: boolean;
}

export class S3StorageService implements StorageService {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly publicBaseUrl: string;

  constructor(config: S3StorageConfig) {
    this.bucket = config.bucket;
    this.publicBaseUrl = config.publicBaseUrl.replace(/\/$/, '');
    this.client = new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      forcePathStyle: config.forcePathStyle ?? true,
    });
  }

  async put(key: string, body: Buffer, contentType?: string): Promise<string> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType || 'application/octet-stream',
      }),
    );
    return `${this.publicBaseUrl}/${key}`;
  }

  async delete(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }),
    );
  }

  async deletePrefix(prefix: string): Promise<void> {
    let continuationToken: string | undefined;

    do {
      const listResponse = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: prefix,
          ContinuationToken: continuationToken,
        }),
      );

      const objectsToDelete = listResponse.Contents?.map((item) => ({
        Key: item.Key!,
      }));

      if (objectsToDelete && objectsToDelete.length > 0) {
        await this.client.send(
          new DeleteObjectsCommand({
            Bucket: this.bucket,
            Delete: { Objects: objectsToDelete },
          }),
        );
      }

      continuationToken = listResponse.NextContinuationToken;
    } while (continuationToken);
  }
}
