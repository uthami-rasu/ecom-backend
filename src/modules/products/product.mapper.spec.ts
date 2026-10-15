import type { ProductVariant } from './entities/product-variant.entity.js';
import type { Product } from './entities/product.entity.js';
import {
  discountPercent,
  pickDefaultVariant,
  toProductSummary,
  toVariantView,
} from './product.mapper.js';

const variant = (overrides: Partial<ProductVariant>): ProductVariant =>
  ({
    id: 'v',
    productId: 'p',
    label: '500g',
    sku: 'SKU',
    price: 48_000,
    compareAtPrice: null,
    stock: 10,
    sortOrder: 0,
    isActive: true,
    ...overrides,
  }) as ProductVariant;

const product = {
  id: 'p',
  slug: 'melora',
  name: 'Melora',
  subtitle: null,
  origin: 'Western Ghats',
  badge: null,
  minPrice: 27_000,
  ratingAvg: 4.5,
  reviewCount: 2,
  category: { id: 'c', name: 'Raw honey', slug: 'raw-honey' },
} as unknown as Product;

describe('product mapper', () => {
  it('picks the cheapest in-stock variant as default', () => {
    const picked = pickDefaultVariant([
      variant({ id: 'a', price: 27_000, stock: 0 }),
      variant({ id: 'b', price: 48_000, stock: 5 }),
      variant({ id: 'c', price: 90_000, stock: 5 }),
    ]);
    expect(picked?.id).toBe('b');
  });

  it('falls back to the cheapest variant when nothing is in stock', () => {
    expect(
      pickDefaultVariant([
        variant({ id: 'a', price: 2, stock: 0 }),
        variant({ id: 'b', price: 1, stock: 0 }),
      ])?.id,
    ).toBe('b');
  });

  it('computes discount percentages', () => {
    expect(discountPercent(48_000, 56_000)).toBe(14);
    expect(discountPercent(48_000, null)).toBe(0);
    expect(discountPercent(48_000, 40_000)).toBe(0);
  });

  it('hides exact stock and flags low stock', () => {
    expect(toVariantView(variant({ stock: 3 }))).toMatchObject({
      inStock: true,
      lowStock: true,
    });
    expect(toVariantView(variant({ stock: 0 }))).toMatchObject({
      inStock: false,
      lowStock: false,
    });
    expect(toVariantView(variant({ stock: 3 }))).not.toHaveProperty('stock');
  });

  it('builds a summary in rupees', () => {
    const summary = toProductSummary(
      product,
      [
        variant({
          id: 'x',
          label: '250g',
          price: 27_000,
          compareAtPrice: 31_000,
        }),
      ],
      undefined,
    );
    expect(summary).toMatchObject({
      price: 270,
      compareAtPrice: 310,
      discountPercent: 13,
      inStock: true,
      sizes: ['250g'],
      image: null,
      defaultVariantId: 'x',
    });
  });
});
