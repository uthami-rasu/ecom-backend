# Phase 1 — Gap Analysis

Source reviewed: storefront repo `../ecom` (React 19, Redux Toolkit, hash routing) at commit `270611f`.
Status column reflects this backend.

## 1. Features implied by the storefront

| Area | Storefront evidence | Backend need | Status |
|---|---|---|---|
| Product listing | `CategoryPage.tsx` filters in memory: search, category, max price, jar sizes, min rating, 5 sorts | `GET /products` with the same filters/sorts + pagination | ✅ |
| Product detail | `App.tsx` resolves `#product/<slug>`; PDP shows gallery, weights, rating, similar items | `GET /products/:slug` with variants, images, similar | ✅ |
| Weight / pack sizes | PDP weight radio; cart key = `productId + weight` | `product_variants` (label, sku, price, compare-at, stock) | ✅ |
| Categories | Honey: Raw / Honeycomb / Infused / Gift sets; Nuts: Nuts / Mixed / Peanuts / Dried fruits / Other | Two-level `categories` tree | ✅ |
| Home sections | `favoriteProducts`, `trendingProducts` constants | `isFeatured` / `isTrending` flags + filters | ✅ |
| Header search | `SearchPanel.tsx` shows 4 quick results | `GET /products/suggest` | ✅ |
| Cart | `commerceSlice` (client only) | Server cart + guest merge | ✅ |
| Coupons | Hard-coded `JenkateMW` (−25) | Coupon rules, validation, usage limits | ✅ |
| Shipping | Free / Express ₹150 / Pickup; "Free over ₹999" | Server-side shipping options | ✅ |
| Checkout | Contact + shipping address, billing same as shipping | `POST /orders` (saved or inline address) | ✅ |
| Order complete / history | `placeOrder` reducer, mocked history rows | Orders API, `BSC-XXXXXXXX` numbers | ✅ |
| Payment | "Credit Card" hard-coded | Mock provider (success / failure / pending) behind Razorpay-ready interface | ✅ |
| Account | Profile, password, avatar, logout; no login UI | Auth + users APIs | ✅ |
| Addresses | Billing / shipping cards | Address book with defaults | ✅ |
| Wishlist | Redux id list | Wishlist API | ✅ |
| Reviews | Review list, distribution bars, write form | Reviews API with distribution | ✅ |
| Contact / newsletter | Forms only toast | `POST /contact`, `POST /newsletter` | ✅ |
| Admin | none | Category/product CRUD, images, orders, coupons, dashboard | ✅ |

## 2. Gaps and inconsistencies resolved

- [x] No backend at all — all data was bundled constants.
- [x] Two incompatible product models (`HoneyProduct` string ids + slug vs `Product` numeric ids) → one schema, UUID + slug.
- [x] Mixed currency (USD formatter on the account page) → INR everywhere, paise in the DB.
- [x] Stock not enforced (`inStock` boolean vs optional `stock`) → per-variant stock, atomic reservation at checkout.
- [x] Totals trusted from the client → computed server-side only; client price fields are rejected.
- [x] No pagination → all list endpoints paginated (`limit ≤ 50`).
- [x] No image pipeline → WebP renditions (1200/600/200) for `srcset`.
- [x] No auth/roles → JWT + refresh rotation, customer/admin RBAC.

## 3. Performance findings

**Storefront (recommendations only — frontend is frozen)**

1. Single 417 KB JS bundle — every page is imported eagerly in `App.tsx` → route-level `React.lazy`.
2. `CategoryPage.applyFilters` waits an artificial 700 ms (`setTimeout`) on every apply.
3. PDP loads full-size images for the main image and 4 thumbnails, no `srcset` / dimensions / `fetchpriority`; assets total 3.8 MB with single images up to 330 KB.
4. Contact hero pulls a 2000 px Unsplash image from CSS.
5. One 162 KB CSS bundle (would split with lazy routes).

**Backend (implemented)** — composite + trigram indexes, batched hydration (no N+1), selective columns, versioned catalog cache, `Cache-Control` + ETag/304, gzip, denormalised `min_price` / ratings, WebP renditions with immutable caching. See README → Performance.
