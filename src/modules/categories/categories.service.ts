import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CatalogCacheService } from '../../common/cache/catalog-cache.service.js';
import {
  offsetOf,
  paginate,
  type Paginated,
} from '../../common/dto/pagination.dto.js';
import { escapeLike, slugify } from '../../common/utils/text.js';
import { ImageUploadService } from '../storage/image-upload.service.js';
import { Category } from './category.entity.js';
import type {
  AdminCategoryQueryDto,
  CreateCategoryDto,
  UpdateCategoryDto,
} from './dto/category.dto.js';

export interface CategoryNode {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  imageUrl: string | null;
  productCount: number;
  children: CategoryNode[];
}

export interface AdminCategoryView {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  imageUrl: string | null;
  parentId: string | null;
  parentName: string | null;
  sortOrder: number;
  isActive: boolean;
  productCount: number;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class CategoriesService {
  constructor(
    @InjectRepository(Category)
    private readonly categories: Repository<Category>,
    private readonly cache: CatalogCacheService,
    private readonly images: ImageUploadService,
  ) {}

  /** Active categories as a two-level tree; parents count products of their children too. */
  getTree(): Promise<CategoryNode[]> {
    return this.cache.getOrSet('categories:tree', async () => {
      const rows = await this.categories
        .createQueryBuilder('c')
        .select([
          'c.id',
          'c.name',
          'c.slug',
          'c.description',
          'c.imageUrl',
          'c.parentId',
          'c.sortOrder',
        ])
        .addSelect(
          (sub) =>
            sub
              .select('COUNT(*)')
              .from('products', 'p')
              .where('p.category_id = c.id')
              .andWhere('p.is_active = true'),
          'product_count',
        )
        .where('c.isActive = true')
        .orderBy('c.sortOrder', 'ASC')
        .addOrderBy('c.name', 'ASC')
        .getRawAndEntities();

      const counts = new Map(
        rows.raw.map((raw: { c_id: string; product_count: string }) => [
          raw.c_id,
          Number(raw.product_count),
        ]),
      );
      const nodes = new Map<string, CategoryNode>();
      for (const category of rows.entities) {
        nodes.set(category.id, {
          id: category.id,
          name: category.name,
          slug: category.slug,
          description: category.description,
          imageUrl: category.imageUrl,
          productCount: counts.get(category.id) ?? 0,
          children: [],
        });
      }
      const roots: CategoryNode[] = [];
      for (const category of rows.entities) {
        const node = nodes.get(category.id)!;
        const parent = category.parentId
          ? nodes.get(category.parentId)
          : undefined;
        if (parent) {
          parent.children.push(node);
          parent.productCount += node.productCount;
        } else if (!category.parentId) {
          roots.push(node);
        }
      }
      return roots;
    });
  }

  async getBySlug(slug: string): Promise<CategoryNode> {
    const find = (nodes: CategoryNode[]): CategoryNode | undefined => {
      for (const node of nodes) {
        if (node.slug === slug) return node;
        const child = find(node.children);
        if (child) return child;
      }
      return undefined;
    };
    const node = find(await this.getTree());
    if (!node) throw new NotFoundException('Category not found');
    return node;
  }

  /** Category id plus active descendants, used to filter products by a parent category. */
  async resolveIdsForSlug(slug: string): Promise<string[]> {
    const node = await this.getBySlug(slug);
    return [node.id, ...node.children.map((child) => child.id)];
  }

  // ── Admin ──────────────────────────────────────────────

  async adminList(
    query: AdminCategoryQueryDto,
  ): Promise<Paginated<AdminCategoryView>> {
    const qb = this.adminBaseQuery();
    if (query.search) {
      qb.andWhere('(c.name ILIKE :search OR c.slug ILIKE :search)', {
        search: `%${escapeLike(query.search)}%`,
      });
    }
    if (query.parentId)
      qb.andWhere('c.parentId = :parentId', { parentId: query.parentId });
    if (query.isActive !== undefined)
      qb.andWhere('c.isActive = :isActive', { isActive: query.isActive });

    const total = await qb.getCount();

    if (query.sort === 'newest') {
      qb.orderBy('c.createdAt', 'DESC');
    } else if (query.sort === 'oldest') {
      qb.orderBy('c.createdAt', 'ASC');
    } else if (query.sort === 'name') {
      qb.orderBy('c.name', 'ASC');
    } else if (query.sort === 'products') {
      qb.orderBy('product_count', 'DESC').addOrderBy('c.name', 'ASC');
    } else {
      qb.orderBy('c.sortOrder', 'ASC').addOrderBy('c.name', 'ASC');
    }

    const { raw, entities } = await qb
      .offset(offsetOf(query))
      .limit(query.limit)
      .getRawAndEntities();
    return paginate(this.toAdminViews(entities, raw), total, query);
  }

  async adminGet(id: string): Promise<AdminCategoryView> {
    const { raw, entities } = await this.adminBaseQuery()
      .where('c.id = :id', { id })
      .getRawAndEntities();
    if (!entities.length) throw new NotFoundException('Category not found');
    return this.toAdminViews(entities, raw)[0];
  }

  async create(dto: CreateCategoryDto): Promise<AdminCategoryView> {
    const slug = dto.slug ?? slugify(dto.name);
    if (!slug)
      throw new BadRequestException(
        'Could not derive a slug from the name; provide one explicitly',
      );
    if (dto.parentId) await this.assertValidParent(dto.parentId);

    const category = await this.categories.save(
      this.categories.create({
        name: dto.name,
        slug,
        description: dto.description ?? null,
        parentId: dto.parentId ?? null,
        sortOrder: dto.sortOrder ?? 0,
        isActive: dto.isActive ?? true,
      }),
    );
    await this.cache.invalidate();
    return this.adminGet(category.id);
  }

  async update(id: string, dto: UpdateCategoryDto): Promise<AdminCategoryView> {
    const category = await this.categories.findOneBy({ id });
    if (!category) throw new NotFoundException('Category not found');

    if (dto.parentId) {
      if (dto.parentId === id)
        throw new BadRequestException('A category cannot be its own parent');
      await this.assertValidParent(dto.parentId);
      if (await this.categories.existsBy({ parentId: id })) {
        throw new BadRequestException(
          'A category with sub-categories cannot become a sub-category',
        );
      }
    }

    Object.assign(category, {
      ...dto,
      ...(dto.description !== undefined && {
        description: dto.description || null,
      }),
    });
    await this.categories.save(category);
    await this.cache.invalidate();
    return this.adminGet(id);
  }

  async remove(id: string): Promise<void> {
    const category = await this.categories.findOne({
      where: { id },
      select: { id: true, imageStorageKey: true },
    });
    if (!category) throw new NotFoundException('Category not found');

    const [{ products, children }] = await this.categories.query(
      `SELECT (SELECT COUNT(*) FROM products WHERE category_id = $1)::int AS products,
              (SELECT COUNT(*) FROM categories WHERE parent_id = $1)::int AS children`,
      [id],
    );
    if (children > 0)
      throw new ConflictException(
        `Category has ${children} sub-categories; move or delete them first`,
      );
    if (products > 0)
      throw new ConflictException(
        `Category has ${products} products; move or delete them first`,
      );

    await this.categories.delete({ id });
    await this.images.remove(category.imageStorageKey);
    await this.cache.invalidate();
  }

  async setImage(
    id: string,
    file: Express.Multer.File | undefined,
  ): Promise<AdminCategoryView> {
    const category = await this.categories.findOne({
      where: { id },
      select: { id: true, imageStorageKey: true },
    });
    if (!category) throw new NotFoundException('Category not found');

    const stored = await this.images.upload('categories', file);
    await this.categories.update(
      { id },
      { imageUrl: stored.mediumUrl, imageStorageKey: stored.storageKey },
    );
    await this.images.remove(category.imageStorageKey);
    await this.cache.invalidate();
    return this.adminGet(id);
  }

  async exists(id: string): Promise<boolean> {
    return this.categories.existsBy({ id });
  }

  private async assertValidParent(parentId: string): Promise<void> {
    const parent = await this.categories.findOneBy({ id: parentId });
    if (!parent)
      throw new BadRequestException('Parent category does not exist');
    if (parent.parentId)
      throw new BadRequestException(
        'Categories can only be nested one level deep',
      );
  }

  private adminBaseQuery() {
    return this.categories
      .createQueryBuilder('c')
      .leftJoin('c.parent', 'parent')
      .addSelect(['parent.id', 'parent.name'])
      .addSelect(
        (sub) =>
          sub
            .select('COUNT(*)')
            .from('products', 'p')
            .where('p.category_id = c.id'),
        'product_count',
      );
  }

  private toAdminViews(
    entities: Category[],
    raw: Array<{ c_id: string; product_count: string }>,
  ): AdminCategoryView[] {
    const counts = new Map(
      raw.map((row) => [row.c_id, Number(row.product_count)]),
    );
    return entities.map((category) => ({
      id: category.id,
      name: category.name,
      slug: category.slug,
      description: category.description,
      imageUrl: category.imageUrl,
      parentId: category.parentId,
      parentName: category.parent?.name ?? null,
      sortOrder: category.sortOrder,
      isActive: category.isActive,
      productCount: counts.get(category.id) ?? 0,
      createdAt: category.createdAt,
      updatedAt: category.updatedAt,
    }));
  }
}
