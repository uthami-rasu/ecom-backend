// DataSource used by the TypeORM CLI (migrations) and the seed script.
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import configuration from '../config/configuration.js';
import { loadEnvFile } from './load-env.js';
import { buildDataSourceOptions } from './typeorm.options.js';

loadEnvFile();

const AppDataSource = new DataSource(
  buildDataSourceOptions(configuration().db),
);
export default AppDataSource;
