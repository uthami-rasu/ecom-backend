# Bossco Naturals — Commerce API

NestJS 12 + PostgreSQL 16 (TypeORM 1.x) backend for the existing Bossco Naturals storefront
(`../ecom`, React + Vite). The storefront is untouched; this repo only provides the API it needs,
plus admin APIs for managing the catalog and orders.

- **Swagger UI:** `http://localhost:3000/api/docs` · **OpenAPI JSON:** `/api/docs-json`
- **Base URL:** `http://localhost:3000/api/v1` · **Health:** `GET /api/v1/health`
- **Dev inbox (Mailpit):** `http://localhost:8025` — every email the API sends in development lands here
- Gap analysis: [docs/GAP_ANALYSIS.md](docs/GAP_ANALYSIS.md) · Admin panel UI spec: [docs/ADMIN_PANEL_SPEC.md](docs/ADMIN_PANEL_SPEC.md)

---

## Quick start

```bash
docker compose up -d                 # Postgres 16 on 127.0.0.1:5433 (+ ecom_test) and Mailpit (SMTP 1025, inbox :8025)
npm install                          # if npm 10 fails with "reading 'edgesOut'", use: npx npm@11 install
cp .env.example .env                 # then replace the three secrets (see comments in the file)
npm run migration:run                # builds, then applies migrations
npm run seed                         # 11 categories, 20 products (with images), 3 coupons, admin + 3 customers
npm run start:dev                    # http://localhost:3000/api/v1
```

Seeded logins (development only; seeded accounts are already email-verified):

| Role | Email | Password |
|---|---|---|
| Admin | `ADMIN_EMAIL` from `.env` (default `admin@bossco.local`) | `ADMIN_PASSWORD` (default `ChangeMe@12345`) |
| Customer | `anita.thomas@example.com`, `rohan.kapoor@example.com`, `meera.iyer@example.com` | `Customer@123` |

Coupons: `WELCOME10` (10 %, min ₹499, max ₹200), `JENKATEMW` (flat ₹25, the code shown in the storefront's checkout), `MONSOON15` (expired — for testing).

### Scripts

| Script | Purpose |
|---|---|
| `npm run start:dev` / `start:prod` | Run with watch / run compiled build |
| `npm run migration:run` · `migration:revert` | Apply / roll back migrations |
| `npm run migration:generate --name=AddFoo` | Diff entities against the DB into a new migration (then register it in `src/database/migrations/index.ts`) |
| `npm run seed` · `seed:reset` | Idempotent seed · wipe data then seed (refuses in production) |
| `npm test` | Unit tests (no DB) |
| `npm run test:e2e` | E2E tests against `ecom_test` (rebuilt from migrations + seeded each run) |
| `npm run test:all` | Unit + e2e with combined coverage report in `coverage/` |
| `npm run lint` · `typecheck` | oxlint (type-aware) · `tsc --noEmit` |

---

## Project structure

```
src/
├── main.ts                     bootstrap (rawBody for webhooks)
├── app.module.ts               config, TypeORM, cache, throttler, global guards
├── app.setup.ts                helmet, CORS, compression, validation, filters, static uploads, Swagger
├── config/                     typed configuration + Joi env validation
├── common/
│   ├── cache/                  CatalogCacheService (versioned read-through cache)
│   ├── decorators/             @Public, @Roles, @CurrentUser, @StrictRateLimit
│   ├── guards/                 JwtAuthGuard (global), RolesGuard (global)
│   ├── filters/                DB error → HTTP mapping (no SQL leaks), body-parser errors
│   ├── dto/                    pagination
│   └── utils/                  money (paise ↔ rupees), stripHtml, escapeLike, slugify, transforms
├── database/
│   ├── entities.ts             explicit entity list
│   ├── migrations/             InitialSchema (generated) + ProductSearchIndex (pg_trgm) + EmailOtpAndOrderTracking (hand-written)
│   ├── seeds/                  seed data mirrored from the storefront constants
│   └── data-source.ts          TypeORM CLI data source
└── modules/
    ├── auth/                   register + email verification, login, refresh rotation, logout, password reset/change
    ├── otp/                    email one-time codes (HMAC-hashed, expiry, attempts, resend cooldown)
    ├── mail/                   MailService (nodemailer: smtp | log | memory) + branded HTML/text templates
    ├── users/                  profile, avatar upload, saved addresses, verified email change
    ├── categories/             public tree
    ├── products/               public listing/detail/suggest + ProductsAdminService
    ├── reviews/                list with distribution, create (verified-purchase flag)
    ├── wishlist/
    ├── cart/                   server cart, guest-cart merge, coupons, live totals
    ├── coupons/                rules + atomic usage counting
    ├── pricing/                pure pricing rules shared by cart and checkout
    ├── orders/                 checkout transaction, history, cancel, status machine, tracking, timeline, customer emails
    ├── payments/               PaymentProvider interface, MockPaymentProvider, webhooks
    ├── storage/                StorageService interface, local disk, sharp image pipeline
    ├── contact/                contact form, newsletter
    ├── admin/                  admin-only controllers + dashboard stats
    └── health/
test/                           e2e suites (auth, otp, catalog, cart, checkout, order-tracking, admin, security, rate-limit)
seed-assets/products/           product photos copied from the storefront for seeding
docs/                           gap analysis, admin panel UI spec
```

### Why TypeORM

Chosen at plan review. It fits Nest's decorator/DI idioms (entities, `@InjectRepository`,
`TypeOrmModule.forFeature`), has first-class Postgres support (enums, jsonb, partial selects,
`DISTINCT ON`, pessimistic locks) and generates migrations from entity diffs. Trade-offs handled
explicitly: `synchronize` is **always off** (migrations only), relation types use `Relation<>` for
ESM safety, and every query is either a repository call or a parameterised QueryBuilder.

---

## Data model

```
users ─┬─< addresses              categories ─< categories (one level of nesting)
       ├─< refresh_tokens (hashed)     └─< products ─┬─< product_variants (label, sku, price, stock)
       ├─< email_otps (HMAC of code, purpose, attempts, expiry)
       ├── carts ─< cart_items >───────────────────────┤
       ├─< wishlist_items >── products                 └─< product_images (lg/md/sm WebP)
       ├─< reviews >── products
       └─< orders ─┬─< order_items (snapshot: name, sku, price, image)
                   ├─< order_events (timeline: status | null, title, note, actor)
                   └─< payments (provider order/payment ids, status)
coupons · contact_messages · newsletter_subscribers
```

- **Money** is stored as integer **paise** and exposed by the API as **rupees** (matches the storefront's `price: 480`).
- **Variants** model the storefront's weight selector: the cart is keyed by variant, exactly like the frontend's `productId + weight`.
- **Denormalised for speed:** `products.min_price` (sorting/filtering), `rating_avg`, `review_count`.
- **Orders snapshot** product name, SKU, unit price, image and addresses, so history survives catalog edits.
- Named constraints (`uq_*`, `fk_*`, `chk_*`) are mapped to friendly 409 messages.

---

## API reference

All paths are prefixed with `/api/v1`. 🔓 public · 🔑 customer token · 🛡 admin token. Full schemas in Swagger.

### Auth & account
| | Method & path | Notes |
|---|---|---|
| 🔓 | `POST /auth/register` | `{email,password,firstName,lastName}` → **201** `OtpChallenge` (no tokens). Always a customer. Verified email → 409; unverified email → name/password replaced, fresh code |
| 🔓 | `POST /auth/verify-email` | `{email, code}` → 200 `{accessToken, refreshToken, tokenType, expiresIn, user}`. Wrong code → 400 `Invalid or expired code`; the 5th wrong guess burns the code → 400 `Too many attempts. Request a new code.` |
| 🔓 | `POST /auth/resend-otp` | `{email, purpose: verify_email\|reset_password}` → always **202** `OtpChallenge` (no enumeration; skipped silently during the cooldown) |
| 🔓 | `POST /auth/login` | Strict rate limit. Correct password on an unverified account → **403** `{statusCode, error, code: "EMAIL_NOT_VERIFIED", message, email}` and a code is sent (cooldown respected) |
| 🔓 | `POST /auth/forgot-password` | `{email}` → always **202** `OtpChallenge`; emails a `reset_password` code if the account exists |
| 🔓 | `POST /auth/reset-password` | `{email, code, newPassword}` → 200 tokens; marks the email verified and revokes every other session |
| 🔓 | `POST /auth/refresh` | Rotates the refresh token; replaying an old one revokes the session family |
| 🔓 | `POST /auth/logout` | Revokes the refresh token family |
| 🔑 | `GET /auth/me` | |
| 🔑 | `POST /auth/change-password` | Signs out all other sessions, returns fresh tokens |
| 🔑 | `GET/PATCH /users/me` | Profile (`firstName, lastName, displayName, phone`; `email` is **not** accepted here → 400). Profile includes `emailVerified` |
| 🔑 | `POST /users/me/email-change` | `{newEmail, password}` → **202** `OtpChallenge` (code sent to the **new** address). 401 wrong password · 409 taken · 400 same as current |
| 🔑 | `POST /users/me/email-change/confirm` | `{code}` → 200 profile with the new email; a notice goes to the old address. 409 if the address was taken meanwhile |
| 🔑 | `POST /users/me/avatar` | multipart `image` |
| 🔑 | `GET/POST /users/me/addresses`, `PATCH/DELETE /users/me/addresses/:id` | Single default shipping/billing |

### Catalog
| | Method & path | Notes |
|---|---|---|
| 🔓 | `GET /categories` · `GET /categories/:slug` | Tree with product counts |
| 🔓 | `GET /products` | `page, limit≤50, search, category, minPrice, maxPrice, sizes, minRating, sort, featured, trending, inStock` |
| 🔓 | `GET /products/suggest?q=&limit=` | Header search overlay |
| 🔓 | `GET /products/:slug` | Variants, images, similar products |
| 🔓/🔑 | `GET /products/:slug/reviews` · `POST /products/:slug/reviews` | Distribution + pagination; one review per customer |

`sort` accepts the storefront's `CatalogSort` values: `featured | newest | price-low | price-high | rating`.

### Shopping
| | Method & path | Notes |
|---|---|---|
| 🔑 | `GET /cart?shippingMethod=standard\|express\|pickup` | Server-computed totals + shipping options |
| 🔑 | `POST /cart/items` · `PATCH/DELETE /cart/items/:id` · `DELETE /cart` | Stock & max-20-per-line enforced |
| 🔑 | `POST /cart/merge` | Merge the guest (Redux) cart after login; idempotent |
| 🔑 | `POST /cart/coupon` · `DELETE /cart/coupon` | Invalid codes return the reason |
| 🔑 | `GET /wishlist` · `PUT/DELETE /wishlist/:productId` | Idempotent |
| 🔑 | `POST /orders` | Checkout from cart (saved or inline address) |
| 🔑 | `GET /orders` · `GET /orders/:orderNumber` · `POST /orders/:orderNumber/cancel` | Every order has `tracking`; the detail adds `timeline` (oldest first) |
| 🔑 | `POST /payments/orders/:orderNumber` | Create a gateway order → `{id, providerOrderId, amount, checkout}` |
| 🔑 | `POST /payments/:id/mock-checkout` | **Mock only** — simulates the gateway widget: `{outcome: success\|failure\|pending}` |
| 🔑 | `POST /payments/:id/confirm` | `{providerPaymentId, signature}` (Razorpay: `razorpay_payment_id`, `razorpay_signature`) |
| 🔑 | `GET /payments/:id` | |
| 🔓 | `POST /payments/webhook` | HMAC-signed (`x-payment-signature`), Razorpay-shaped events |
| 🔓 | `POST /contact` · `POST /newsletter` | Strict rate limit |

### Admin (🛡 all)
| Method & path | Notes |
|---|---|
| `GET /admin/dashboard` | Totals, revenue, 30-day sales series, orders by status, low stock, top products, recent orders |
| `GET/POST /admin/categories`, `GET/PATCH/DELETE /admin/categories/:id`, `POST /admin/categories/:id/image` | Delete refuses categories with products/children (409) |
| `GET/POST /admin/products`, `GET/PATCH/DELETE /admin/products/:id` | List: `search` (name/slug/SKU), `categoryId`, `isActive`, `stockStatus`, `sort` |
| `POST /admin/products/:id/variants`, `PATCH/DELETE /admin/products/:id/variants/:variantId` | Keeps ≥ 1 variant; recalculates `min_price` |
| `POST /admin/products/:id/images`, `DELETE /admin/products/:id/images/:imageId` | multipart `image` (+ `alt`, `sortOrder`), ≤ 5 MB, max 10 per product |
| `GET /admin/orders`, `GET /admin/orders/:id` | List items include `tracking`; detail adds `timeline`, `allowedTransitions`, `customer {id,email,firstName,lastName,phone}` |
| `PATCH /admin/orders/:id/status` | `{status, note?, carrier?, trackingNumber?, trackingUrl?, estimatedDeliveryAt?, notifyCustomer?=true}` — validated transition (409 otherwise) |
| `PATCH /admin/orders/:id/tracking` | `{carrier?, trackingNumber?, trackingUrl?, estimatedDeliveryAt?, note?, notifyCustomer?=false}` — records a "Tracking updated" event |
| `POST /admin/orders/:id/events` | `{title?="Shipment update", note (3–500), notifyCustomer?=false}` → 201 order detail |
| `GET/POST /admin/coupons`, `GET/PATCH/DELETE /admin/coupons/:id` | |
| `GET /admin/contact-messages`, `PATCH /admin/contact-messages/:id/resolve` | |

Errors use Nest's standard shape: `{ statusCode, message, error }` (`message` is an array for validation errors).

`OtpChallenge` = `{ email, purpose: "verify_email" | "reset_password" | "change_email", expiresInSeconds, resendAfterSeconds }`.

---

## Email & one-time codes

- `MailService` (global) sends through `MAIL_TRANSPORT`: **`smtp`** (Mailpit in development, any relay in production),
  **`log`** (prints subject, recipient and text body) or **`memory`** (in-process `outbox` used by the e2e tests).
  Every email is branded HTML plus a plain-text alternative; user-provided values are HTML-escaped.
- Mailpit runs from `docker compose up -d`: SMTP `127.0.0.1:1025`, inbox **http://localhost:8025**.
- OTP emails are awaited — if delivery fails the request returns **503** `Could not send email, please try again`.
  Order notifications are fire-and-forget (errors are logged, the request still succeeds).
- Codes are 6 random digits (`crypto.randomInt`), stored only as HMAC-SHA256 (keyed with `JWT_ACCESS_SECRET`) and
  compared in constant time. A new code invalidates older unused ones for the same purpose; codes expire after
  `OTP_TTL_SECONDS`; the `OTP_MAX_ATTEMPTS`-th wrong guess burns the code. Resend / login / forgot-password /
  re-registration don't send another code while the previous one is younger than `OTP_RESEND_SECONDS`.
- Self-registered accounts can't log in until verified. Existing users were backfilled as verified by the migration.

| Variable | Default | Notes |
|---|---|---|
| `MAIL_TRANSPORT` | `log` | `smtp` in `.env`, `memory` in `.env.test` |
| `MAIL_HOST` / `MAIL_PORT` / `MAIL_SECURE` | `localhost` / `1025` / `false` | SMTP server (Mailpit) |
| `MAIL_USER` / `MAIL_PASSWORD` | empty | Optional SMTP auth |
| `MAIL_FROM` | `Bossco Naturals <no-reply@bossco.local>` | |
| `STOREFRONT_URL` | `http://localhost:5173` | Base for links in emails (`/#orders/<orderNumber>`) |
| `OTP_TTL_SECONDS` / `OTP_RESEND_SECONDS` / `OTP_MAX_ATTEMPTS` | `600` / `60` / `5` | |

---

## Checkout & payments

```
Storefront                         API                                   Gateway (mock / Razorpay)
──────────                         ───                                   ─────────────────────────
POST /orders ───────────────────▶  lock cart · decrement stock atomically
                                   · consume coupon · snapshot · clear cart
                 ◀─────────────── order (pending_payment)
POST /payments/orders/:no ──────▶  provider.createPaymentOrder() ───────▶ order_xxx
                 ◀─────────────── {paymentId, checkout}
open widget ───────────────────────────────────────────────────────────▶ customer pays
                 ◀─────────────────────────────────────────────────────── paymentId + signature
POST /payments/:id/confirm ─────▶  provider.verifyPayment() (HMAC)
                                   succeeded → order paid
                                   failed    → order payment_failed (retry allowed)
                                   pending   → wait for webhook
                                   ◀──────────────── POST /payments/webhook (signed)
```

- Payment outcomes are applied under a row lock, exactly once; final states never change, so webhook redelivery is harmless.
- Customers can cancel only `pending_payment` / `payment_failed` orders (not while a payment is pending); cancellation restocks and releases the coupon.

### Order lifecycle & tracking

```
pending_payment ──▶ paid ──▶ processing ──▶ packed ──▶ shipped ──▶ out_for_delivery ──▶ delivered
      ⇅                      "Confirmed"    optional      │          optional              ▲
payment_failed                                            └────────────────────────────────┘
cancelled ◀── pending_payment · payment_failed · paid · processing · packed
```

| From | Admin may move to |
|---|---|
| `pending_payment`, `payment_failed` | `cancelled` |
| `paid` | `processing`, `cancelled` |
| `processing` | `packed`, `shipped`, `cancelled` |
| `packed` | `shipped`, `cancelled` |
| `shipped` | `out_for_delivery`, `delivered` |
| `out_for_delivery` | `delivered` |

- Any other transition → **409**. `shipped` stamps `shippedAt` and, without an ETA, defaults `estimatedDeliveryAt` to
  now + 2 days (express) / 5 days (standard) / 1 day (pickup). `delivered` stamps `deliveredAt`. An ETA before
  today (UTC) → 400.
- Every change is written to `order_events`: checkout "Order placed" (customer), payment "Payment received" /
  "Payment failed" (system), customer cancel, each admin status change ("Order confirmed", "Packed and ready to ship",
  "Shipped", "Out for delivery", "Delivered", "Cancelled by store", with the admin's `note`), tracking updates and
  custom events (`status: null`).
- Customer emails (to the order's contact email, linking to `${STOREFRONT_URL}/#orders/<orderNumber>`): payment →
  "Order confirmed #BSC-…"; shipped (carrier, tracking number/link, ETA), out for delivery, delivered, cancelled
  (unless `notifyCustomer: false`); tracking updates and custom events only with `notifyCustomer: true`.

### Integrating Razorpay later

1. `npm i razorpay`, add `RAZORPAY_KEY_ID` to env validation, set `PAYMENT_PROVIDER=razorpay`.
2. Create `providers/razorpay-payment.provider.ts` implementing `PaymentProvider`:
   - `createPaymentOrder` → `razorpay.orders.create({ amount, currency, receipt, notes })`; return `{ providerOrderId: order.id, checkout: { keyId, orderId, amount, currency } }`.
   - `verifyPayment` → HMAC-SHA256(`order_id|payment_id`, key secret) — **same scheme the mock already uses**; then `payments.fetch(id)` to map `captured`/`failed`/`authorized`.
   - `verifyWebhookSignature` → HMAC-SHA256(raw body, webhook secret) vs `x-razorpay-signature`.
   - `parseWebhookEvent` → already Razorpay-shaped (`payment.captured`, `payment.failed`).
3. In `payments.module.ts`, pick the provider with a factory on `PAYMENT_PROVIDER`; read the webhook header name from the provider.
4. The `/mock-checkout` endpoint returns 404 automatically for non-mock providers. No consumer changes.

---

## Security

| Concern | Implementation |
|---|---|
| Authentication | Short-lived HS256 access JWT (algorithm pinned; `alg:none`/re-signed tokens rejected) + opaque refresh tokens stored as SHA-256, rotated on use with reuse detection |
| Authorisation | Global `JwtAuthGuard` (opt-out via `@Public`) + `RolesGuard`; all `/admin/*` require `admin`. Ownership is part of every customer query (IDOR → 404) |
| Passwords | argon2id; dummy verify for unknown emails (timing); identical error for unknown email / wrong password |
| Input validation | Global `ValidationPipe` with `whitelist` + `forbidNonWhitelisted` (rejects `role`, `price`, … mass assignment), strict types, UUID/slug/order-number pipes, body limit 100 kB |
| SQL injection | Repository API / parameterised QueryBuilder only; sort keys mapped to fixed columns; LIKE wildcards escaped |
| XSS | HTML stripped from all free-text input (`stripHtml`); JSON-only responses; helmet CSP |
| Rate limiting | Global 120 req/min/IP; strict 10 req/min on login/register/verify-email/resend-otp/forgot & reset password/email change/refresh/change-password/contact/newsletter |
| Email OTP | 6-digit codes stored as HMAC-SHA256, constant-time comparison, 10 min expiry, burnt after 5 wrong guesses, 60 s resend cooldown, resend/forgot always 202 (no account enumeration); email changes need the password and a code sent to the new address, and the old address is notified |
| Headers / CORS | helmet (HSTS, nosniff, frame-options, CSP…), `x-powered-by` off, CORS allow-list from `CORS_ORIGINS` |
| Uploads | Memory storage with size/count limits; files decoded by sharp (MIME not trusted), re-encoded to WebP (strips EXIF/payloads), pixel limit vs decompression bombs, random names, path-traversal guard |
| Payments | HMAC signatures compared in constant time; webhook authenticated by signature over the raw body; amounts always server-computed |
| Errors | DB errors mapped to generic 4xx messages; no stack/SQL leakage |
| Config | Joi-validated env; secrets required (min length); `synchronize` never enabled |

## Performance

| Area | Implementation |
|---|---|
| Indexes | Composite `(is_active, category_id, min_price)`, `(is_active, min_price)`, `(is_active, rating_avg)`, `(is_active, created_at)`, `(is_active, is_featured)`; pg_trgm GIN index for search; FK and lookup indexes on every relation |
| Queries | Listing = 1 paged query + 2 batched queries (variants, primary images via `DISTINCT ON`) — no N+1. Explicit column selection; product detail fetches only what the PDP renders |
| Pagination | Every list endpoint, `limit ≤ 50`, deterministic ordering |
| Caching | Versioned in-process LRU (5k entries) for categories, listings, suggestions and product detail; any admin write bumps the version. `Cache-Control: public, max-age=60, stale-while-revalidate=300` + ETag/304 on catalog GETs. Swap to `@keyv/redis` for multi-instance |
| Payload | gzip compression (> 1 kB); exact stock hidden from public responses |
| Images | 1200/600/200 px WebP renditions served with `immutable` 30-day caching — enables `srcset` and small thumbnails |

### Storefront performance recommendations (not applied — frontend is frozen)

1. **Code-split routes** — `App.tsx` imports every page eagerly; the single JS chunk is 417 KB. Use `React.lazy` per route.
2. **Remove the artificial 700 ms delay** in `CategoryPage.applyFilters` (`setTimeout(…, 700)`); show the loader only while the API request is in flight.
3. **Responsive images on the PDP** — use the API's `thumbUrl/mediumUrl/url` in `srcset`, `fetchpriority="high"` on the main image, `loading="lazy"` + explicit `width/height` on thumbnails and similar items (currently full-size images for 4 thumbnails).
4. **Self-host the contact hero** (2000 px Unsplash image loaded from CSS).
5. **Fetch PDP data by slug** (`GET /products/:slug`) rather than loading the whole catalog to render one product; prefetch on card hover.

---

## Testing

```bash
npm test            # 139 unit tests, ~5 s, no database
npm run test:e2e    # 130 e2e tests, ~50 s, needs `docker compose up -d` (mail uses the in-memory outbox)
npm run test:all    # both + coverage → coverage/index.html
```

Latest run: **269 tests passed, 0 failed** (24 files). Combined coverage: **89.6 % statements, 75.5 % branches, 92.3 % functions, 90.7 % lines**.

| Suite | Covers |
|---|---|
| Unit | OTP service (hashing, expiry, attempts, invalidation, cooldown), mail templates (escaping), pricing rules, coupon evaluation, order status machine & transition table, order numbers, text/money utils, mock gateway signatures & webhooks, AuthService, TokenService (rotation/reuse/race), guards, CartService, PaymentsService, CouponsService, product mapper, image pipeline, local storage |
| `auth` | register/login/refresh rotation & reuse detection/logout/change password/profile |
| `otp` | register → verify → login, wrong code, max attempts, resend cooldown + no enumeration, 403 `EMAIL_NOT_VERIFIED`, forgot/reset revokes sessions, email change (409, old-address notice), 503 on mail failure |
| `order-tracking` | processing → packed → shipped (default/explicit/past ETA) → out_for_delivery → delivered, invalid transitions, tracking update, custom events, customer timeline, customer blocked from admin endpoints, notification emails |
| `catalog` | category tree, pagination, filters, search, sort, ETag/304, low stock, suggest, reviews |
| `cart` | totals, shipping, stock limits, coupons, guest merge, wishlist, addresses |
| `checkout` | order placement, stock reservation, coupon on order, payment success / failure + retry / pending + webhook, forged signatures, cancellation restock, **concurrent oversell prevention** |
| `admin` | category & product CRUD, variants, image upload (real WebP renditions), validation, orders lifecycle, coupons, dashboard, contact messages |
| `security` | 401 on protected routes, 403 on admin routes for customers, JWT tampering (`alg:none`, edited payload, foreign secret), mass assignment, IDOR, SQL-injection payloads (incl. `pg_sleep`), XSS stripping, malformed/oversized bodies, headers, CORS, path traversal, webhook signature, no DB detail leakage |
| `rate-limit` | 429 after the strict auth budget; catalog unaffected |

---

## Assumptions

1. **Separate repo, frontend untouched.** Seed images are copied from the storefront's assets; nothing in `../ecom` was modified.
2. **Guest cart stays client-side** (current Redux slice) and is merged with `POST /cart/merge` at login. Server carts are per user.
3. **Prices**: API returns rupees (matching `HoneyProduct.price`); DB stores paise. Currency is INR only (the account page's USD formatter looks like a storefront bug).
4. **Shipping**: storefront options map to `standard` (free when the discounted subtotal ≥ ₹999, otherwise ₹49 — the UI says "Free over ₹999"), `express` (₹150), `pickup` (₹0). Values are env-configurable.
5. **Stock is reserved at order creation**, not at payment. Unpaid orders keep stock until cancelled (see follow-ups).
6. **Refresh tokens travel in the JSON body** (simple for a cross-origin SPA). An httpOnly `SameSite` cookie is the recommended hardening once the API and storefront share a site.
7. **Ratings are real**: seeded with 2–3 sample reviews per product, so counts differ from the storefront's hard-coded "124 reviews".
8. **Category depth is two levels** (Honey → Raw honey …), matching the storefront.
9. **Image URLs are stored absolute** using `PUBLIC_BASE_URL`; moving to a CDN means updating that base (and existing rows).
10. Testimonials, benefits, gallery and stats sections remain static storefront content.

## Known limitations / follow-ups

- Scheduled job to cancel unpaid orders after N minutes (release stock) — add `@nestjs/schedule`.
- Refunds for cancelled paid orders are manual (provider refund API not wired while payments are mocked).
- Emails are sent inline (OTP) or fire-and-forget (orders); a persistent mail queue with retries (e.g. BullMQ) is the next step for production.
- For more than one instance: Redis for the cache store and throttler storage; S3/GCS `StorageService` implementation.
- Admin audit log and review moderation endpoints.
