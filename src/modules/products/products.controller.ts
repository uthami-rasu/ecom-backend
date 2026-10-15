import { Controller, Get, Header, Param, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator.js';
import { ProductQueryDto, SuggestQueryDto } from './dto/product-query.dto.js';
import { ProductsService } from './products.service.js';

const PUBLIC_CACHE = 'public, max-age=60, stale-while-revalidate=300';

@ApiTags('Products')
@Public()
@Controller('products')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get()
  @Header('Cache-Control', PUBLIC_CACHE)
  list(@Query() query: ProductQueryDto) {
    return this.products.list(query);
  }

  /** Lightweight results for the header search overlay. */
  @Get('suggest')
  @Header('Cache-Control', PUBLIC_CACHE)
  suggest(@Query() query: SuggestQueryDto) {
    return this.products.suggest(query);
  }

  @Get(':slug')
  @Header('Cache-Control', PUBLIC_CACHE)
  bySlug(@Param('slug') slug: string) {
    return this.products.getBySlug(slug);
  }
}
