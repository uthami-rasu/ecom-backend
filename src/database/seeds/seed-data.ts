/**
 * Sample catalog mirrored from the storefront's constants (honeyProducts, favoriteProducts,
 * trendingProducts) so the existing UI renders the same products from the API.
 * Prices are rupees. Images live in seed-assets/products/<slug>.webp.
 */

export interface SeedCategory {
  name: string;
  slug: string;
  description: string;
  children: Array<{ name: string; slug: string }>;
}

export interface SeedVariant {
  label: string;
  price: number;
  compareAtPrice?: number;
  stock: number;
}

export interface SeedProduct {
  name: string;
  slug: string;
  category: string;
  subtitle: string;
  origin?: string;
  badge?: string;
  isFeatured?: boolean;
  isTrending?: boolean;
  description: string;
  variants: SeedVariant[];
}

export const seedCategories: SeedCategory[] = [
  {
    name: 'Honey',
    slug: 'honey',
    description: 'Raw, small-batch honey from traceable forests and meadows.',
    children: [
      { name: 'Raw honey', slug: 'raw-honey' },
      { name: 'Honeycomb', slug: 'honeycomb' },
      { name: 'Infused honey', slug: 'infused-honey' },
      { name: 'Gift sets', slug: 'gift-sets' },
    ],
  },
  {
    name: 'Dry Fruits & Nuts',
    slug: 'dry-fruits-nuts',
    description: 'Premium nuts, dried fruits and traditional snacks.',
    children: [
      { name: 'Nuts', slug: 'nuts' },
      { name: 'Mixed nuts', slug: 'mixed-nuts' },
      { name: 'Peanuts', slug: 'peanuts' },
      { name: 'Dried fruits', slug: 'dried-fruits' },
      { name: 'Other nuts', slug: 'other-nuts' },
    ],
  },
];

const honeyDescription = (name: string, origin: string) =>
  `Gathered in a limited seasonal harvest, ${name} carries the distinctive character of ${origin}. ` +
  'Its layered amber sweetness and natural floral finish make it beautiful in tea, over warm toast, paired with cheese ' +
  'or enjoyed directly from the spoon. Each jar is gently filtered and packed without artificial additives.';

const snackDescription = (name: string) =>
  `${name} is hand-sorted, packed in small batches and sealed fresh to keep its natural crunch and flavour. ` +
  'No artificial colours or preservatives — just honest ingredients for everyday snacking, gifting and festive platters.';

/** Rounds to a price ending in 9 (e.g. 384 → 389). */
const ninety = (value: number) => Math.max(9, Math.round(value / 10) * 10 - 1);

const nutVariants = (price500: number, stock500: number): SeedVariant[] => [
  { label: '250g', price: ninety(price500 * 0.55), stock: stock500 + 10 },
  { label: '500g', price: price500, stock: stock500 },
  {
    label: '1kg',
    price: ninety(price500 * 1.85),
    stock: Math.max(0, Math.floor(stock500 / 2)),
  },
];

export const seedProducts: SeedProduct[] = [
  // ── Honey (from honeyProducts) ──
  {
    name: 'Melora Raw Forest Honey',
    slug: 'melora-raw-forest-honey',
    category: 'raw-honey',
    subtitle:
      'Deep, malty and wonderfully complex — collected from untouched forest bloom.',
    origin: 'Western Ghats',
    badge: 'Bestseller',
    isFeatured: true,
    description: honeyDescription('Melora Raw Forest Honey', 'Western Ghats'),
    variants: [
      { label: '250g', price: 270, compareAtPrice: 310, stock: 40 },
      { label: '500g', price: 480, compareAtPrice: 560, stock: 32 },
    ],
  },
  {
    name: 'Wild Hive Comb Honey',
    slug: 'wild-hive-comb-honey',
    category: 'honeycomb',
    subtitle: 'Silken raw honey sealed inside tender, edible beeswax comb.',
    origin: 'Nilgiri Hills',
    badge: 'Pure comb',
    description: honeyDescription('Wild Hive Comb Honey', 'the Nilgiri Hills'),
    variants: [{ label: '350g', price: 1250, stock: 14 }],
  },
  {
    name: 'Ancient Forest Artisanal',
    slug: 'ancient-forest-artisanal',
    category: 'raw-honey',
    subtitle:
      'A dark amber harvest with soft woody notes and a long floral finish.',
    origin: 'Aravalli Forest',
    badge: 'Limited harvest',
    description: honeyDescription(
      'Ancient Forest Artisanal',
      'the Aravalli Forest',
    ),
    variants: [
      { label: '250g', price: 520, compareAtPrice: 580, stock: 12 },
      { label: '450g', price: 890, compareAtPrice: 990, stock: 4 },
    ],
  },
  {
    name: 'Acacia Gold Honey',
    slug: 'acacia-gold-honey',
    category: 'raw-honey',
    subtitle:
      'Pale, delicate and slow to crystallise, with a clean vanilla-like sweetness.',
    origin: 'Kashmir Valley',
    badge: 'New season',
    description: honeyDescription('Acacia Gold Honey', 'the Kashmir Valley'),
    variants: [
      { label: '250g', price: 620, stock: 25 },
      { label: '500g', price: 1150, stock: 18 },
    ],
  },
  {
    name: 'Saffron Infused Honey',
    slug: 'saffron-infused-honey',
    category: 'infused-honey',
    subtitle:
      'Raw mountain honey slowly rested with handpicked Kashmiri saffron.',
    origin: 'Pampore, Kashmir',
    badge: 'Bestseller',
    isFeatured: true,
    description: honeyDescription('Saffron Infused Honey', 'Pampore, Kashmir'),
    variants: [
      { label: '200g', price: 780, compareAtPrice: 860, stock: 20 },
      { label: '400g', price: 1450, compareAtPrice: 1600, stock: 9 },
    ],
  },
  {
    name: 'The Honey Tasting Trio',
    slug: 'honey-tasting-trio',
    category: 'gift-sets',
    subtitle: 'Three small-batch harvests gathered in a keepsake gifting box.',
    origin: 'Three Indian terroirs',
    badge: 'Limited harvest',
    description: honeyDescription(
      'The Honey Tasting Trio',
      'three Indian terroirs',
    ),
    variants: [{ label: '3 × 150g', price: 1490, stock: 10 }],
  },

  // ── Dry fruits & nuts (from favoriteProducts) ──
  {
    name: 'Premium Peanut Chikki',
    slug: 'premium-peanut-chikki',
    category: 'peanuts',
    subtitle: 'Roasted peanuts set in golden jaggery brittle.',
    badge: 'Bestseller',
    isFeatured: true,
    description: snackDescription('Premium Peanut Chikki'),
    variants: nutVariants(699, 40),
  },
  {
    name: 'Premium California Almonds',
    slug: 'premium-california-almonds',
    category: 'nuts',
    subtitle: 'Large, crunchy almonds with a naturally sweet finish.',
    isFeatured: true,
    description: snackDescription('Premium California Almonds'),
    variants: nutVariants(699, 32),
  },
  {
    name: 'Premium Dried Figs',
    slug: 'premium-dried-figs',
    category: 'dried-fruits',
    subtitle: 'Soft, jammy figs sun-dried for deep honeyed sweetness.',
    badge: 'Bestseller',
    isFeatured: true,
    description: snackDescription('Premium Dried Figs'),
    variants: nutVariants(699, 12),
  },
  {
    name: 'Premium Green Kiwi',
    slug: 'premium-green-kiwi',
    category: 'dried-fruits',
    subtitle: 'Tangy dried kiwi slices with a bright, zesty bite.',
    isFeatured: true,
    description: snackDescription('Premium Green Kiwi'),
    variants: nutVariants(699, 2),
  },
  {
    name: 'Premium Red Berries',
    slug: 'premium-red-berries',
    category: 'other-nuts',
    subtitle: 'A ruby medley of tart, chewy dried berries.',
    badge: 'New',
    isFeatured: true,
    description: snackDescription('Premium Red Berries'),
    variants: nutVariants(699, 42),
  },
  {
    name: 'Premium Dried Amla',
    slug: 'premium-dried-amla',
    category: 'mixed-nuts',
    subtitle:
      'Vitamin-rich Indian gooseberry, gently dried and lightly spiced.',
    isFeatured: true,
    description: snackDescription('Premium Dried Amla'),
    variants: nutVariants(699, 18),
  },
  {
    name: 'Premium Black Prunes',
    slug: 'premium-black-prunes',
    category: 'dried-fruits',
    subtitle: 'Plump, pitted prunes with a rich caramel depth.',
    isFeatured: true,
    description: snackDescription('Premium Black Prunes'),
    variants: nutVariants(699, 8),
  },
  {
    name: 'Premium Sweet Rings',
    slug: 'premium-sweet-rings',
    category: 'other-nuts',
    subtitle: 'Crisp, lightly sweetened fruit rings for snacking.',
    isFeatured: true,
    description: snackDescription('Premium Sweet Rings'),
    variants: nutVariants(699, 24),
  },

  // ── Trending (from trendingProducts) ──
  {
    name: 'Crunchy Masala Bites',
    slug: 'crunchy-masala-bites',
    category: 'other-nuts',
    subtitle: 'Spiced, crunchy bites inspired by classic murukku.',
    isTrending: true,
    description: snackDescription('Crunchy Masala Bites'),
    variants: nutVariants(349, 30),
  },
  {
    name: 'Royal Trail Mix',
    slug: 'royal-trail-mix',
    category: 'mixed-nuts',
    subtitle: 'Almonds, cashews, raisins and berries in one handful.',
    isTrending: true,
    description: snackDescription('Royal Trail Mix'),
    variants: nutVariants(599, 26),
  },
  {
    name: 'Golden Kiwi Slices',
    slug: 'golden-kiwi-slices',
    category: 'dried-fruits',
    subtitle: 'Sunny golden kiwi with a honeyed tropical tang.',
    isTrending: true,
    description: snackDescription('Golden Kiwi Slices'),
    variants: nutVariants(449, 22),
  },
  {
    name: 'Ruby Cranberries',
    slug: 'ruby-cranberries',
    category: 'dried-fruits',
    subtitle: 'Sweet-tart dried cranberries, perfect for baking and salads.',
    isTrending: true,
    description: snackDescription('Ruby Cranberries'),
    variants: nutVariants(399, 35),
  },
  {
    name: 'Whole Premium Cashews',
    slug: 'whole-premium-cashews',
    category: 'nuts',
    subtitle: 'W240 whole cashews — creamy, buttery and crisp.',
    isTrending: true,
    description: snackDescription('Whole Premium Cashews'),
    variants: nutVariants(799, 28),
  },
  {
    name: 'Green Kiwi Coins',
    slug: 'green-kiwi-coins',
    category: 'dried-fruits',
    subtitle: 'Bite-sized kiwi coins with a lively citrus snap.',
    isTrending: true,
    description: snackDescription('Green Kiwi Coins'),
    variants: nutVariants(449, 16),
  },
];

export const seedCustomers = [
  { email: 'anita.thomas@example.com', firstName: 'Anita', lastName: 'Thomas' },
  { email: 'rohan.kapoor@example.com', firstName: 'Rohan', lastName: 'Kapoor' },
  { email: 'meera.iyer@example.com', firstName: 'Meera', lastName: 'Iyer' },
];

/** Development-only password for the sample customers. */
export const SEED_CUSTOMER_PASSWORD = 'Customer@123';

export const seedReviews = [
  {
    rating: 5,
    title: 'Beautiful flavour and freshness',
    content:
      'The aroma is wonderful and it tastes genuinely fresh. The packaging also makes it feel very premium.',
  },
  {
    rating: 5,
    title: 'A lovely everyday favourite',
    content:
      'Balanced and not overwhelmingly sweet. It has become our favourite for breakfast and evening tea.',
  },
  {
    rating: 4,
    title: 'Great quality, will reorder',
    content:
      'Really good quality and well packed. Delivery took a day longer than expected but worth the wait.',
  },
];

export const seedCoupons = [
  {
    code: 'WELCOME10',
    description: '10% off your first order (max ₹200)',
    type: 'percentage',
    value: 10,
    minSubtotal: 499,
    maxDiscount: 200,
  },
  {
    code: 'JENKATEMW',
    description: 'Flat ₹25 off',
    type: 'fixed',
    value: 25,
    minSubtotal: 0,
    maxDiscount: null,
  },
  {
    code: 'MONSOON15',
    description: 'Expired seasonal offer (kept for testing)',
    type: 'percentage',
    value: 15,
    minSubtotal: 0,
    maxDiscount: null,
    expiresAt: new Date('2026-01-01T00:00:00Z'),
  },
] as const;
