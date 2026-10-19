/**
 * One-time migration script: uploads seed product images to S3 and
 * updates the product_images table URLs from localhost → S3 public URL.
 *
 * Usage:  npx tsx src/database/seeds/fix-seed-image-urls.ts
 */
import 'reflect-metadata';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { DataSource } from 'typeorm';
import configuration from '../../config/configuration.js';
import { processImage } from '../../modules/storage/image-processing.js';
import { S3StorageService } from '../../modules/storage/s3-storage.service.js';
import { loadEnvFile } from '../load-env.js';
import { buildDataSourceOptions } from '../typeorm.options.js';

loadEnvFile();
const config = configuration();

if (config.uploads.driver !== 's3') {
  console.error('STORAGE_DRIVER is not "s3" – nothing to fix.');
  process.exit(1);
}

const s3 = new S3StorageService({
  endpoint: config.uploads.s3.endpoint,
  region: config.uploads.s3.region,
  bucket: config.uploads.s3.bucket,
  accessKeyId: config.uploads.s3.accessKeyId,
  secretAccessKey: config.uploads.s3.secretAccessKey,
  publicBaseUrl: config.uploads.s3.publicBaseUrl,
  forcePathStyle: config.uploads.s3.forcePathStyle,
});

const dataSource = new DataSource(buildDataSourceOptions(config.db));
await dataSource.initialize();

try {
  // Find all product_images with localhost URLs
  const rows: { id: string; url: string; storage_key: string }[] =
    await dataSource.query(
      `SELECT id, url, storage_key FROM product_images WHERE url LIKE '%localhost%'`,
    );

  console.log(`Found ${rows.length} product image(s) with localhost URLs.\n`);

  let fixed = 0;
  for (const row of rows) {
    const slug = row.storage_key.replace('products/seed-', '');
    const assetPath = resolve('seed-assets/products', `${slug}.webp`);

    const source = await readFile(assetPath).catch(() => null);
    if (!source) {
      console.warn(`  ⚠ No seed asset for "${slug}" – skipping.`);
      continue;
    }

    const renditions = await processImage(source);
    const key = row.storage_key; // e.g. "products/seed-premium-sweet-rings"

    const [url, mediumUrl, thumbUrl] = await Promise.all([
      s3.put(`${key}-lg.webp`, renditions.lg, 'image/webp'),
      s3.put(`${key}-md.webp`, renditions.md, 'image/webp'),
      s3.put(`${key}-sm.webp`, renditions.sm, 'image/webp'),
    ]);

    await dataSource.query(
      `UPDATE product_images SET url = $1, medium_url = $2, thumb_url = $3 WHERE id = $4`,
      [url, mediumUrl, thumbUrl, row.id],
    );

    console.log(`  ✓ ${slug}`);
    fixed++;
  }

  console.log(`\nDone – fixed ${fixed}/${rows.length} image(s).`);
} finally {
  await dataSource.destroy();
}
