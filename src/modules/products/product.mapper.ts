import { toRupees, toRupeesOrNull } from '../../common/utils/money.js';
import type { ProductImage } from './entities/product-image.entity.js';
import type { ProductVariant } from './entities/product-variant.entity.js';
import type { Product } from './entities/product.entity.js';

export const LOW_STOCK_THRESHOLD = 5;

export interface ImageView {
  id: string;
  url: string;
  mediumUrl: string;
  thumbUrl: string;
  alt: string | null;
}

export interface VariantView {
  id: string;
  label: string;
  sku: string;
  price: number;
  compareAtPrice: number | null;
  inStock: boolean;
  /** Exact stock is hidden from shoppers; this flags "only a few left". */
  lowStock: boolean;
}

export interface ProductSummary {
  id: string;
  slug: string;
  name: string;
  subtitle: string | null;
  origin: string | null;
  badge: string | null;
  category: { id: string; name: string; slug: string };
  image: ImageView | null;
  price: number;
  compareAtPrice: number | null;
  discountPercent: number;
  rating: number;
  reviewCount: number;
  inStock: boolean;
  sizes: string[];
  defaultVariantId: string | null;
}

export interface ProductDetail extends ProductSummary {
  description: string | null;
  images: ImageView[];
  variants: VariantView[];
  similar: ProductSummary[];
}

export const toImageView = (image: ProductImage): ImageView => ({
  id: image.id,
  url: image.url,
  mediumUrl: image.mediumUrl,
  thumbUrl: image.thumbUrl,
  alt: image.alt,
});

export const toVariantView = (variant: ProductVariant): VariantView => ({
  id: variant.id,
  label: variant.label,
  sku: variant.sku,
  price: toRupees(variant.price),
  compareAtPrice: toRupeesOrNull(variant.compareAtPrice),
  inStock: variant.stock > 0,
  lowStock: variant.stock > 0 && variant.stock <= LOW_STOCK_THRESHOLD,
});

export const discountPercent = (
  price: number,
  compareAtPrice: number | null,
): number =>
  compareAtPrice && compareAtPrice > price
    ? Math.round((1 - price / compareAtPrice) * 100)
    : 0;

/** The variant a "quick add" button should use: cheapest in stock, else the first one. */
export function pickDefaultVariant(
  variants: ProductVariant[],
): ProductVariant | undefined {
  const inStock = variants.filter((variant) => variant.stock > 0);
  const pool = inStock.length ? inStock : variants;
  return [...pool].sort(
    (a, b) => a.price - b.price || a.sortOrder - b.sortOrder,
  )[0];
}

export function toProductSummary(
  product: Product,
  variants: ProductVariant[],
  image: ProductImage | undefined,
): ProductSummary {
  const defaultVariant = pickDefaultVariant(variants);
  const price = defaultVariant?.price ?? product.minPrice;
  const compareAt = defaultVariant?.compareAtPrice ?? null;
  return {
    id: product.id,
    slug: product.slug,
    name: product.name,
    subtitle: product.subtitle,
    origin: product.origin,
    badge: product.badge,
    category: {
      id: product.category!.id,
      name: product.category!.name,
      slug: product.category!.slug,
    },
    image: image ? toImageView(image) : null,
    price: toRupees(price),
    compareAtPrice: toRupeesOrNull(compareAt),
    discountPercent: discountPercent(price, compareAt),
    rating: product.ratingAvg,
    reviewCount: product.reviewCount,
    inStock: variants.some((variant) => variant.stock > 0),
    sizes: variants.map((variant) => variant.label),
    defaultVariantId: defaultVariant?.id ?? null,
  };
}
