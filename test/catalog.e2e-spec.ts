import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { API, createTestApp, registerUser, bearer } from './utils/app.js';

describe('Catalog browsing (e2e)', () => {
  let app: NestExpressApplication;
  let http: () => ReturnType<typeof request>;

  beforeAll(async () => {
    app = await createTestApp();
    http = () => request(app.getHttpServer());
  });
  afterAll(() => app.close());

  describe('categories', () => {
    it('returns the active category tree with product counts', async () => {
      const res = await http().get(`${API}/categories`).expect(200);
      const honey = res.body.find(
        (category: { slug: string }) => category.slug === 'honey',
      );
      expect(
        honey.children.map((child: { slug: string }) => child.slug),
      ).toEqual(
        expect.arrayContaining([
          'raw-honey',
          'honeycomb',
          'infused-honey',
          'gift-sets',
        ]),
      );
      expect(honey.productCount).toBe(6);
      expect(res.headers['cache-control']).toContain('public');
    });

    it('returns a category by slug and 404 for unknown slugs', async () => {
      await http().get(`${API}/categories/raw-honey`).expect(200);
      await http().get(`${API}/categories/does-not-exist`).expect(404);
    });
  });

  describe('product listing', () => {
    it('paginates with metadata', async () => {
      const res = await http()
        .get(`${API}/products?limit=5&page=2`)
        .expect(200);
      expect(res.body.data).toHaveLength(5);
      expect(res.body.meta).toEqual({
        page: 2,
        limit: 5,
        total: 20,
        totalPages: 4,
      });
    });

    it('caps page size at 50', async () => {
      await http().get(`${API}/products?limit=500`).expect(400);
    });

    it('filters by parent category (includes sub-categories)', async () => {
      const res = await http()
        .get(`${API}/products?category=honey&limit=50`)
        .expect(200);
      expect(res.body.meta.total).toBe(6);
      expect(
        res.body.data.every((p: { category: { slug: string } }) =>
          ['raw-honey', 'honeycomb', 'infused-honey', 'gift-sets'].includes(
            p.category.slug,
          ),
        ),
      ).toBe(true);
    });

    it('returns an empty page for an unknown category', async () => {
      const res = await http()
        .get(`${API}/products?category=unknown-category`)
        .expect(200);
      expect(res.body.meta.total).toBe(0);
    });

    it('searches name, subtitle and origin case-insensitively', async () => {
      const res = await http()
        .get(`${API}/products?search=KASHMIR`)
        .expect(200);
      expect(res.body.data.map((p: { slug: string }) => p.slug).sort()).toEqual(
        ['acacia-gold-honey', 'saffron-infused-honey'],
      );
    });

    it('treats LIKE wildcards in search literally', async () => {
      const res = await http().get(`${API}/products?search=%25`).expect(200);
      expect(res.body.meta.total).toBe(0);
    });

    it('filters by price range, sizes and rating, and sorts by price', async () => {
      const res = await http()
        .get(
          `${API}/products?category=honey&maxPrice=700&sizes=250g&minRating=4&sort=price-low`,
        )
        .expect(200);
      const prices = res.body.data.map((p: { price: number }) => p.price);
      expect(prices.length).toBeGreaterThan(0);
      expect(prices).toEqual([...prices].sort((a, b) => a - b));
      expect(
        res.body.data.every(
          (p: { sizes: string[]; rating: number }) =>
            p.sizes.includes('250g') && p.rating >= 4,
        ),
      ).toBe(true);
    });

    it('supports featured / trending flags for home page sections', async () => {
      const trending = await http()
        .get(`${API}/products?trending=true`)
        .expect(200);
      expect(trending.body.meta.total).toBe(6);
      const featured = await http()
        .get(`${API}/products?featured=true&category=dry-fruits-nuts`)
        .expect(200);
      expect(featured.body.meta.total).toBe(8);
    });

    it('returns listing summaries with responsive image renditions', async () => {
      const res = await http().get(`${API}/products?search=melora`).expect(200);
      const [product] = res.body.data;
      expect(product).toMatchObject({
        slug: 'melora-raw-forest-honey',
        price: 270,
        compareAtPrice: 310,
        discountPercent: 13,
        inStock: true,
        sizes: ['250g', '500g'],
      });
      expect(product.image.thumbUrl).toMatch(/-sm\.webp$/);
      expect(product.image.mediumUrl).toMatch(/-md\.webp$/);
      expect(product).not.toHaveProperty('description');
    });

    it('rejects unknown query parameters and invalid sort keys', async () => {
      await http()
        .get(`${API}/products?sort=price; DROP TABLE products`)
        .expect(400);
      await http().get(`${API}/products?orderBy=name`).expect(400);
    });
  });

  describe('product detail', () => {
    it('returns variants, images and similar products', async () => {
      const res = await http()
        .get(`${API}/products/melora-raw-forest-honey`)
        .expect(200);
      expect(res.body.variants.map((v: { label: string }) => v.label)).toEqual([
        '250g',
        '500g',
      ]);
      expect(res.body.variants[0]).not.toHaveProperty('stock');
      expect(res.body.images).toHaveLength(1);
      expect(res.body.similar.length).toBeGreaterThan(0);
      expect(
        res.body.similar.every(
          (p: { category: { slug: string } }) =>
            p.category.slug === 'raw-honey',
        ),
      ).toBe(true);
      expect(res.headers.etag).toBeDefined();
    });

    it('supports conditional requests (ETag → 304)', async () => {
      const first = await http()
        .get(`${API}/products/acacia-gold-honey`)
        .expect(200);
      await http()
        .get(`${API}/products/acacia-gold-honey`)
        .set('If-None-Match', first.headers.etag)
        .expect(304);
    });

    it('flags low stock without exposing exact counts', async () => {
      const res = await http()
        .get(`${API}/products/premium-green-kiwi`)
        .expect(200);
      const kiwi500 = res.body.variants.find(
        (v: { label: string }) => v.label === '500g',
      );
      expect(kiwi500).toMatchObject({ inStock: true, lowStock: true });
    });

    it('404s for unknown products', async () => {
      await http().get(`${API}/products/no-such-product`).expect(404);
    });

    it('serves uploaded images with long-lived cache headers', async () => {
      const res = await http()
        .get(`${API}/products/melora-raw-forest-honey`)
        .expect(200);
      const path = new URL(res.body.images[0].thumbUrl).pathname;
      const image = await http().get(path).expect(200);
      expect(image.headers['content-type']).toBe('image/webp');
      expect(image.headers['cache-control']).toContain('immutable');
    });
  });

  describe('search suggestions', () => {
    it('returns at most `limit` lightweight results', async () => {
      const res = await http()
        .get(`${API}/products/suggest?q=kiwi&limit=2`)
        .expect(200);
      expect(res.body).toHaveLength(2);
      expect(Object.keys(res.body[0]).sort()).toEqual([
        'category',
        'id',
        'name',
        'price',
        'slug',
        'thumbUrl',
      ]);
    });

    it('requires a query', async () => {
      await http().get(`${API}/products/suggest`).expect(400);
    });
  });

  describe('reviews', () => {
    it('lists reviews with a rating distribution', async () => {
      const res = await http()
        .get(`${API}/products/wild-hive-comb-honey/reviews`)
        .expect(200);
      expect(res.body.summary.count).toBe(res.body.meta.total);
      const distributionTotal = Object.values(
        res.body.summary.distribution as Record<string, number>,
      ).reduce((a, b) => a + b, 0);
      expect(distributionTotal).toBe(res.body.summary.count);
      expect(res.body.data[0].author.name).toMatch(/^[A-Z][a-z]+ [A-Z]\.$/);
    });

    it('lets a signed-in customer review once and updates the product rating', async () => {
      const user = await registerUser(app, 'reviewer');
      const before = (
        await http().get(`${API}/products/royal-trail-mix`).expect(200)
      ).body;

      await http()
        .post(`${API}/products/royal-trail-mix/reviews`)
        .send({ rating: 1, title: 'x', content: 'y' })
        .expect(401);
      const created = await http()
        .post(`${API}/products/royal-trail-mix/reviews`)
        .set(bearer(user.accessToken))
        .send({
          rating: 1,
          title: 'Not for me',
          content: 'Too spicy for my taste, sadly.',
        })
        .expect(201);
      expect(created.body).toMatchObject({
        rating: 1,
        isVerifiedPurchase: false,
      });

      const after = (
        await http().get(`${API}/products/royal-trail-mix`).expect(200)
      ).body;
      expect(after.reviewCount).toBe(before.reviewCount + 1);
      expect(after.rating).toBeLessThan(before.rating);

      await http()
        .post(`${API}/products/royal-trail-mix/reviews`)
        .set(bearer(user.accessToken))
        .send({
          rating: 5,
          title: 'Changed my mind',
          content: 'Second review should be rejected.',
        })
        .expect(409);
    });
  });
});
