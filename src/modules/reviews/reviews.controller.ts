import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  CurrentUser,
  type AuthUser,
} from '../../common/decorators/current-user.decorator.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { PaginationQueryDto } from '../../common/dto/pagination.dto.js';
import { CreateReviewDto } from './dto/review.dto.js';
import { ReviewsService } from './reviews.service.js';

@ApiTags('Reviews')
@Controller('products/:slug/reviews')
export class ReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Public()
  @Get()
  list(@Param('slug') slug: string, @Query() query: PaginationQueryDto) {
    return this.reviews.list(slug, query);
  }

  @ApiBearerAuth()
  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Param('slug') slug: string,
    @Body() dto: CreateReviewDto,
  ) {
    return this.reviews.create(user.id, slug, dto);
  }
}
