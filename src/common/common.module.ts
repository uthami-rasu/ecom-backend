import { Global, Module } from '@nestjs/common';
import { CatalogCacheService } from './cache/catalog-cache.service.js';

@Global()
@Module({
  providers: [CatalogCacheService],
  exports: [CatalogCacheService],
})
export class CommonModule {}
