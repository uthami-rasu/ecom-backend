import 'reflect-metadata';
import { DataSource } from 'typeorm';
import configuration from '../../config/configuration.js';
import { loadEnvFile } from '../load-env.js';
import { buildDataSourceOptions } from '../typeorm.options.js';
import { resetDatabase, seedDatabase } from './seed.js';

loadEnvFile();
const config = configuration();
const adminEmail = process.env.ADMIN_EMAIL;
const adminPassword = process.env.ADMIN_PASSWORD;
if (!adminEmail || !adminPassword) {
  console.error(
    'ADMIN_EMAIL and ADMIN_PASSWORD must be set to seed the database',
  );
  process.exit(1);
}

const dataSource = new DataSource(buildDataSourceOptions(config.db));
await dataSource.initialize();
try {
  await dataSource.runMigrations({ transaction: 'each' });
  if (process.argv.includes('--reset')) {
    await resetDatabase(dataSource);
    console.log('database reset');
  }
  await seedDatabase(dataSource, {
    admin: { email: adminEmail, password: adminPassword },
    uploads: config.uploads,
    log: (message) => console.log(`seed › ${message}`),
  });
  console.log('seed complete');
} finally {
  await dataSource.destroy();
}
