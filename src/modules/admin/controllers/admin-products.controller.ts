import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import {
  AdminProductQueryDto,
  CreateProductDto,
  CreateVariantDto,
  ImageUploadMetaDto,
  UpdateProductDto,
  UpdateVariantDto,
} from '../../products/dto/admin-product.dto.js';
import { ProductsAdminService } from '../../products/products-admin.service.js';
import { AdminOnly } from '../admin.decorator.js';

@ApiTags('Admin · Products')
@AdminOnly()
@Controller('admin/products')
export class AdminProductsController {
  constructor(private readonly products: ProductsAdminService) {}

  @Get()
  list(@Query() query: AdminProductQueryDto) {
    return this.products.list(query);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.products.get(id);
  }

  @Post()
  create(@Body() dto: CreateProductDto) {
    return this.products.create(dto);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProductDto,
  ) {
    return this.products.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.products.remove(id);
  }

  // ── Variants ───────────────────────────────────────────

  @Post(':id/variants')
  addVariant(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateVariantDto,
  ) {
    return this.products.addVariant(id, dto);
  }

  @Patch(':id/variants/:variantId')
  updateVariant(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('variantId', ParseUUIDPipe) variantId: string,
    @Body() dto: UpdateVariantDto,
  ) {
    return this.products.updateVariant(id, variantId, dto);
  }

  @Delete(':id/variants/:variantId')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeVariant(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('variantId', ParseUUIDPipe) variantId: string,
  ) {
    return this.products.removeVariant(id, variantId);
  }

  // ── Images ─────────────────────────────────────────────

  @Post(':id/images')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['image'],
      properties: {
        image: { type: 'string', format: 'binary' },
        alt: { type: 'string' },
        sortOrder: { type: 'integer' },
      },
    },
  })
  @UseInterceptors(FileInterceptor('image'))
  addImage(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() meta: ImageUploadMetaDto,
  ) {
    return this.products.addImage(id, file, meta);
  }

  @Delete(':id/images/:imageId')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeImage(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('imageId', ParseUUIDPipe) imageId: string,
  ) {
    return this.products.removeImage(id, imageId);
  }
}
