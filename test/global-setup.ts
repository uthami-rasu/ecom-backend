import 'reflect-metadata';
import { rm } from 'node:fs/promises';
import { DataSource } from 'typeorm';
import configuration from '../src/config/configuration.js';
import { loadEnvFile } from '../src/database/load-env.js';
import { seedDatabase } from '../src/database/seeds/seed.js';
import { buildDataSourceOptions } from '../src/database/typeorm.options.js';

/** Rebuilds the test database from migrations and seeds it once per run. */
export default async function setup() {
  process.env.NODE_ENV = 'test';
  loadEnvFile();
  const config = configuration();
  if (!config.db.name.endsWith('_test'))
    throw new Error(`Refusing to run e2e tests against "${config.db.name}"`);

  await rm(config.uploads.dir, { recursive: true, force: true });
  const dataSource = new DataSource(buildDataSourceOptions(config.db));
  await dataSource.initialize();
  try {
    await dataSource.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    await dataSource.runMigrations({ transaction: 'each' });
    await seedDatabase(dataSource, {
      admin: {
        email: process.env.ADMIN_EMAIL!,
        password: process.env.ADMIN_PASSWORD!,
      },
      uploads: config.uploads,
    });
  } finally {
    await dataSource.destroy();
  }

  return async () => {
    await rm(config.uploads.dir, { recursive: true, force: true });
  };
}
