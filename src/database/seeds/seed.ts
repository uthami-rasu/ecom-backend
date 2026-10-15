import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { DataSource } from 'typeorm';
import { Role } from '../../common/enums/role.enum.js';
import { toPaise } from '../../common/utils/money.js';
import type { AppConfig } from '../../config/configuration.js';
import { Category } from '../../modules/categories/category.entity.js';
import { Coupon, CouponType } from '../../modules/coupons/coupon.entity.js';
import { ProductImage } from '../../modules/products/entities/product-image.entity.js';
import { ProductVariant } from '../../modules/products/entities/product-variant.entity.js';
import { Product } from '../../modules/products/entities/product.entity.js';
import { Review } from '../../modules/reviews/review.entity.js';
import { processImage } from '../../modules/storage/image-processing.js';
import { LocalStorageService } from '../../modules/storage/local-storage.service.js';
import { User } from '../../modules/users/entities/user.entity.js';
import { UsersService } from '../../modules/users/users.service.js';
import {
  SEED_CUSTOMER_PASSWORD,
  seedCategories,
  seedCoupons,
  seedCustomers,
  seedProducts,
  seedReviews,
} from './seed-data.js';

export interface SeedOptions {
  admin: { email: string; password: string };
  uploads: AppConfig['uploads'];
  withImages?: boolean;
  log?: (message: string) => void;
}

/** Idempotent: existing rows (matched by slug / email / code) are left untouched. */
export async function seedDatabase(
  dataSource: DataSource,
  options: SeedOptions,
): Promise<void> {
  const log = options.log ?? (() => undefined);
  const storage = new LocalStorageService(
    options.uploads.dir,
    options.uploads.publicBaseUrl,
  );

  await dataSource.transaction(async (manager) => {
    // Users
    const users = manager.getRepository(User);
    const ensureUser = async (
      email: string,
      password: string,
      firstName: string,
      lastName: string,
      role: Role,
    ) => {
      const existing = await users.findOneBy({ email: email.toLowerCase() });
      if (existing) return existing;
      return users.save(
        users.create({
          email: email.toLowerCase(),
          passwordHash: await UsersService.hashPassword(password),
          firstName,
          lastName,
          displayName: `${firstName} ${lastName}`,
          role,
          // Seeded accounts can sign in straight away.
          emailVerifiedAt: new Date(),
        }),
      );
    };
    await ensureUser(
      options.admin.email,
      options.admin.password,
      'Store',
      'Admin',
      Role.Admin,
    );
    const customers: User[] = [];
    for (const customer of seedCustomers) {
      customers.push(
        await ensureUser(
          customer.email,
          SEED_CUSTOMER_PASSWORD,
          customer.firstName,
          customer.lastName,
          Role.Customer,
        ),
      );
    }
    log(`users: admin + ${customers.length} sample customers`);

    // Categories
    const categories = manager.getRepository(Category);
    const categoryIds = new Map<string, string>();
    for (const [index, parent] of seedCategories.entries()) {
      const saved =
        (await categories.findOneBy({ slug: parent.slug })) ??
        (await categories.save(
          categories.create({
            name: parent.name,
            slug: parent.slug,
            description: parent.description,
            sortOrder: index,
          }),
        ));
      categoryIds.set(parent.slug, saved.id);
      for (const [childIndex, child] of parent.children.entries()) {
        const savedChild =
          (await categories.findOneBy({ slug: child.slug })) ??
          (await categories.save(
            categories.create({
              name: child.name,
              slug: child.slug,
              parentId: saved.id,
              sortOrder: childIndex,
            }),
          ));
        categoryIds.set(child.slug, savedChild.id);
      }
    }
    log(`categories: ${categoryIds.size}`);

    // Products, variants, images, reviews
    const products = manager.getRepository(Product);
    let created = 0;
    for (const [index, seed] of seedProducts.entries()) {
      if (await products.existsBy({ slug: seed.slug })) continue;
      const product = await products.save(
        products.create({
          name: seed.name,
          slug: seed.slug,
          subtitle: seed.subtitle,
          description: seed.description,
          origin: seed.origin ?? null,
          badge: seed.badge ?? null,
          categoryId: categoryIds.get(seed.category)!,
          isFeatured: seed.isFeatured ?? false,
          isTrending: seed.isTrending ?? false,
          minPrice: toPaise(
            Math.min(...seed.variants.map((variant) => variant.price)),
          ),
          // Stagger creation times so "newest" sorting is meaningful.
          createdAt: new Date(
            Date.now() - (seedProducts.length - index) * 60_000,
          ),
        }),
      );
      await manager.getRepository(ProductVariant).save(
        seed.variants.map((variant, variantIndex) =>
          manager.getRepository(ProductVariant).create({
            productId: product.id,
            label: variant.label,
            sku: `${seed.slug.toUpperCase().slice(0, 40)}-${variant.label.toUpperCase().replace(/[^A-Z0-9]/g, '')}`,
            price: toPaise(variant.price),
            compareAtPrice: variant.compareAtPrice
              ? toPaise(variant.compareAtPrice)
              : null,
            stock: variant.stock,
            sortOrder: variantIndex,
          }),
        ),
      );

      if (options.withImages !== false) {
        const source = await readFile(
          resolve('seed-assets/products', `${seed.slug}.webp`),
        ).catch(() => null);
        if (source) {
          const renditions = await processImage(source);
          const storageKey = `products/seed-${seed.slug}`;
          const [url, mediumUrl, thumbUrl] = await Promise.all([
            storage.put(`${storageKey}-lg.webp`, renditions.lg),
            storage.put(`${storageKey}-md.webp`, renditions.md),
            storage.put(`${storageKey}-sm.webp`, renditions.sm),
          ]);
          await manager.getRepository(ProductImage).save({
            productId: product.id,
            url,
            mediumUrl,
            thumbUrl,
            storageKey,
            alt: seed.name,
            sortOrder: 0,
          });
        }
      }

      const reviewCount = 2 + (index % 2);
      const reviews = seedReviews
        .slice(0, reviewCount)
        .map((review, reviewIndex) =>
          manager.getRepository(Review).create({
            ...review,
            productId: product.id,
            userId: customers[reviewIndex].id,
          }),
        );
      await manager.getRepository(Review).save(reviews);
      await manager.query(
        `UPDATE products SET rating_avg = (SELECT ROUND(AVG(rating)::numeric, 2) FROM reviews WHERE product_id = $1),
                             review_count = (SELECT COUNT(*) FROM reviews WHERE product_id = $1)
         WHERE id = $1`,
        [product.id],
      );
      created += 1;
    }
    log(
      `products: ${created} created (${seedProducts.length - created} already present)`,
    );

    // Coupons
    const coupons = manager.getRepository(Coupon);
    for (const coupon of seedCoupons) {
      if (await coupons.existsBy({ code: coupon.code })) continue;
      await coupons.save(
        coupons.create({
          code: coupon.code,
          description: coupon.description,
          type: coupon.type as CouponType,
          value:
            coupon.type === 'percentage' ? coupon.value : toPaise(coupon.value),
          minSubtotal: toPaise(coupon.minSubtotal),
          maxDiscount:
            coupon.maxDiscount === null ? null : toPaise(coupon.maxDiscount),
          expiresAt: 'expiresAt' in coupon ? coupon.expiresAt : null,
        }),
      );
    }
    log(`coupons: ${seedCoupons.map((coupon) => coupon.code).join(', ')}`);
  });
}

/** Removes all data (keeps schema). Refuses to run in production. */
export async function resetDatabase(dataSource: DataSource): Promise<void> {
  if (process.env.NODE_ENV === 'production')
    throw new Error('Refusing to reset a production database');
  const tables = dataSource.entityMetadatas
    .map((metadata) => `"${metadata.tableName}"`)
    .join(', ');
  await dataSource.query(`TRUNCATE ${tables} RESTART IDENTITY CASCADE`);
}
