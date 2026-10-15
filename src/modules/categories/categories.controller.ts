import { Controller, Get, Header, Param } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator.js';
import { CategoriesService } from './categories.service.js';

const PUBLIC_CACHE = 'public, max-age=300, stale-while-revalidate=600';

@ApiTags('Categories')
@Public()
@Controller('categories')
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Get()
  @Header('Cache-Control', PUBLIC_CACHE)
  tree() {
    return this.categories.getTree();
  }

  @Get(':slug')
  @Header('Cache-Control', PUBLIC_CACHE)
  bySlug(@Param('slug') slug: string) {
    return this.categories.getBySlug(slug);
  }
}
