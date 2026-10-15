import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Cache } from 'cache-manager';
import type { AppConfig } from '../../config/configuration.js';

const VERSION_KEY = 'catalog:version';

/**
 * Read-through cache for public catalog data (categories, listings, product detail).
 * Every key embeds a catalog "version"; admin writes bump the version, which
 * invalidates all catalog entries at once without tracking individual keys.
 * Works unchanged with a shared Redis store for multi-instance deployments.
 */
@Injectable()
export class CatalogCacheService {
  private readonly ttl: number;

  constructor(
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
    config: ConfigService<AppConfig, true>,
  ) {
    this.ttl = config.get('cacheTtlMs', { infer: true });
  }

  async getOrSet<T>(key: string, loader: () => Promise<T>): Promise<T> {
    if (this.ttl === 0) return loader();
    const versionedKey = `catalog:${await this.version()}:${key}`;
    const cached = await this.cache.get<T>(versionedKey);
    if (cached !== undefined && cached !== null) return cached;
    const value = await loader();
    await this.cache.set(versionedKey, value, this.ttl);
    return value;
  }

  async invalidate(): Promise<void> {
    await this.cache.set(VERSION_KEY, Date.now(), 0);
  }

  private async version(): Promise<number> {
    return (await this.cache.get<number>(VERSION_KEY)) ?? 0;
  }
}
