import type { DataSourceOptions } from 'typeorm';
import type { AppConfig } from '../config/configuration.js';
import { entities } from './entities.js';
import { migrations } from './migrations/index.js';
import { SnakeNamingStrategy } from './snake-naming.strategy.js';

export function buildDataSourceOptions(db: AppConfig['db']): DataSourceOptions {
  return {
    type: 'postgres',
    host: db.host,
    port: db.port,
    username: db.user,
    password: db.password,
    database: db.name,
    ssl: db.ssl ? { rejectUnauthorized: true } : false,
    entities,
    migrations,
    namingStrategy: new SnakeNamingStrategy(),
    // gen_random_uuid() is built into Postgres 13+, so no extension is required.
    uuidExtension: 'pgcrypto',
    // Schema changes only ever happen through reviewed migrations.
    synchronize: false,
    migrationsRun: false,
    logging: db.logging ? ['query', 'error'] : ['error'],
    extra: { max: db.poolMax },
  };
}
