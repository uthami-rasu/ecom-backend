# Phase 4 — Admin Panel UI Specification

A separate, lightweight admin app for managing categories, products, orders and coupons
against the `/api/v1/admin/*` endpoints of this backend. It does **not** touch the customer
storefront (`../ecom`); it lives in its own repo/app (suggested name `ecom-admin`) and is
deployed on its own origin (e.g. `admin.bossconaturals.com`, added to `CORS_ORIGINS`).

---

## 1. Stack

Same toolchain as the storefront so the team can move between them:

| Concern | Choice | Why |
|---|---|---|
| Framework | React 19 + Vite + TypeScript | Matches storefront |
| Routing | React Router (data routers) with `lazy()` per route | Real URLs (deep links to an order), code splitting |
| Server state | Redux Toolkit **RTK Query** | Already a storefront dependency; caching, tag invalidation, polling |
| Forms | React Hook Form + Zod | Fast uncontrolled forms; schemas mirror backend DTO rules |
| Styling | Tailwind CSS v4 with `@theme` design tokens | Matches storefront; no runtime CSS-in-JS cost |
| Icons / toasts | lucide-react, sonner | Matches storefront |
| Charts | Recharts (dashboard only, lazy-loaded) | Small, declarative |

Budget: initial JS < 150 KB gzip; each route chunk < 60 KB gzip.

---

## 2. Visual theme — "light, clean, premium", Flipkart-inspired

Flipkart's admin/seller surfaces read as: light grey canvas, white cards, a confident blue
header, yellow/orange calls to action, dense but calm tables. We keep that hierarchy and add
the Bossco honey accent for brand continuity.

### Design tokens (`src/styles/theme.css`)

```css
@import 'tailwindcss';

@theme {
  /* Surfaces */
  --color-canvas: #f1f3f6;        /* page background (Flipkart grey) */
  --color-surface: #ffffff;       /* cards, tables, drawers */
  --color-surface-muted: #f8f9fb; /* table header, zebra rows */
  --color-border: #e0e3e8;

  /* Brand */
  --color-primary: #2874f0;       /* header, links, primary buttons */
  --color-primary-hover: #1f5fd1;
  --color-primary-soft: #e8f0fe;  /* selected rows, active nav */
  --color-cta: #fb641b;           /* "Publish", "Save product" */
  --color-highlight: #ffe11b;     /* badges, focus accents (sparingly) */
  --color-honey: #d6941a;         /* Bossco accent: logo, featured stars */

  /* Text */
  --color-ink: #212121;
  --color-ink-muted: #616161;
  --color-ink-subtle: #9e9e9e;

  /* Status */
  --color-success: #388e3c;  --color-success-soft: #e8f5e9;
  --color-warning: #f9a825;  --color-warning-soft: #fff8e1;
  --color-danger:  #e53935;  --color-danger-soft:  #ffebee;
  --color-info:    #0288d1;  --color-info-soft:    #e1f5fe;

  /* Type */
  --font-sans: 'Inter', 'Roboto', system-ui, sans-serif;
  --text-xs: 0.75rem; --text-sm: 0.8125rem; --text-base: 0.875rem; --text-lg: 1rem; --text-xl: 1.25rem; --text-2xl: 1.5rem;

  /* Shape & depth */
  --radius-sm: 4px; --radius-md: 8px; --radius-lg: 12px;
  --shadow-card: 0 1px 2px rgb(0 0 0 / 0.06), 0 1px 3px rgb(0 0 0 / 0.08);
  --shadow-raised: 0 4px 16px rgb(0 0 0 / 0.12);
}
```

Rules of use

- **One primary action per screen** (orange `cta` button, top-right of the page header). Secondary actions are white buttons with a border; destructive actions are red text buttons that open a confirm dialog.
- **Cards** (`surface`, `radius-md`, `shadow-card`, 20–24 px padding) group everything; the canvas never carries content directly.
- **Density**: base text 14 px, table rows 52 px (64 px with a thumbnail), 8 px spacing grid.
- **Status is always text + colour** (never colour alone) for accessibility: e.g. a green "In stock" pill, an amber "Low stock · 3", a red "Out of stock".
- Contrast AA everywhere; visible 2 px `primary` focus ring on all interactive elements.
- Light theme only for v1 (tokens make a dark theme a later, isolated change).

### Order status → badge mapping

| Status | Badge |
|---|---|
| `pending_payment` | warning "Awaiting payment" |
| `payment_failed` | danger "Payment failed" |
| `paid` | info "Paid" |
| `processing` | primary-soft "Processing" |
| `shipped` | primary "Shipped" |
| `delivered` | success "Delivered" |
| `cancelled` | neutral "Cancelled" |

---

## 3. Layout

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ ■ Bossco Admin      [ 🔍 Search products, orders…            ]   🔔  Admin ▾ │  56px, primary blue
├──────────────┬───────────────────────────────────────────────────────────────┤
│ ▣ Dashboard  │  Home / Catalog / Products                                    │  breadcrumb
│ ▤ Catalog    │  Products                               [ + Add product ]     │  page header
│   Products   │ ┌───────────────────────────────────────────────────────────┐ │
│   Categories │ │ filters bar                                               │ │
│ ▥ Orders     │ ├───────────────────────────────────────────────────────────┤ │
│ % Coupons    │ │ table / form cards                                        │ │
│ ✉ Messages   │ └───────────────────────────────────────────────────────────┘ │
│              │                                                               │
│ (240px, white│  content max-width 1440px, 24px gutters, canvas background    │
│  collapsible)│                                                               │
└──────────────┴───────────────────────────────────────────────────────────────┘
```

- Sidebar collapses to a 64 px icon rail below 1280 px and to a drawer below 768 px.
- Global search (top bar) queries `GET /admin/products?search=` and `GET /admin/orders?search=` in parallel and shows grouped results.

---

## 4. Pages

### 4.1 Dashboard — `GET /admin/dashboard`

| Row | Content |
|---|---|
| KPI cards (4) | Revenue (30 days), Orders (all time), Average order value, Customers — big number, small label, subtle icon |
| Charts (2/3 + 1/3) | **Sales, last 30 days**: bars = orders, line = revenue (`salesLast30Days`) · **Orders by status**: horizontal bars (`ordersByStatus`) |
| Lists (1/2 + 1/2) | **Low stock** (`lowStock`, link to product edit, "Restock" quick action → variant stock inline edit) · **Recent orders** (`recentOrders`, link to order detail) |
| Footer card | **Top products** (`topProducts`) — units and revenue |

Skeletons while loading; refresh button; auto-refresh every 60 s while the tab is visible.

### 4.2 Categories — `/catalog/categories`

- **Tree table**: parent rows expandable to children (parents from `GET /admin/categories?limit=50`; children via `parentId`). Columns: image thumb, name + slug, products count, sort order, active switch, actions (edit, delete).
- **Create / edit** in a right-side **drawer** (480 px): name (slug auto-generated live, editable), parent (top-level only), description, sort order, active, image uploader.
- **Delete** opens a confirm dialog; a 409 from the API ("has 4 products; move or delete them first") is shown inline in the dialog, not as a generic toast.
- Active switch is optimistic (`PATCH /admin/categories/:id {isActive}`), rolled back on error.

### 4.3 Products list — `/catalog/products`

Filters bar (all reflected in the URL query string so views are shareable):

| Control | API param |
|---|---|
| Search input (debounced 300 ms) — name, slug or SKU | `search` |
| Category select (grouped by parent) | `categoryId` |
| Status segmented control: All / Active / Hidden | `isActive` |
| Stock chips: In stock / Low / Out | `stockStatus` |
| Sort: Newest, Name, Price ↑, Price ↓, Lowest stock | `sort` |

Table columns: checkbox · 48 px thumbnail (`thumbUrl`) · name + slug · category · price (from) · stock pill (`totalStock`, `stockStatus`) · variants count · rating ★ (count) · active switch · updated · row menu (Edit, View on store, Delete).

Pagination footer: "Showing 21–40 of 132", page size 20/50, prev/next + numbered pages (`meta`).
Empty states: no products yet (CTA "Add your first product") vs. no results for the filters (CTA "Clear filters").

### 4.4 Product create / edit — `/catalog/products/new`, `/catalog/products/:id`

Two-column form, sticky footer bar with **Save** (orange) and **Discard**:

```
┌─────────────────────────────── 2/3 ───────────────────────────────┐ ┌──────── 1/3 ────────┐
│ Basic information                                                  │ │ Status              │
│   Name · Slug (auto) · Subtitle · Origin                           │ │   Active  [switch]  │
│   Description (plain text, 10k chars, counter)                     │ │   Featured [switch] │
├────────────────────────────────────────────────────────────────────┤ │   Trending [switch] │
│ Images  (drag & drop, max 10, first = primary)                     │ ├─────────────────────┤
│   [img][img][img][ + ]   alt text per image                        │ │ Organisation        │
├────────────────────────────────────────────────────────────────────┤ │   Category (select) │
│ Variants (pack sizes)                                              │ │   Badge (text)      │
│   Label | SKU | Price ₹ | Compare-at ₹ | Stock | Active | ⋯        │ ├─────────────────────┤
│   250g  | …   | 270     | 310          | 40    |  ✓     | ⋯        │ │ Insights (edit only)│
│   [ + Add variant ]                                                │ │   Rating, reviews   │
└────────────────────────────────────────────────────────────────────┘ └─────────────────────┘
```

- **Create** sends `POST /admin/products` with the initial `variants[]`; images can be added right after (the form switches to edit mode with the new id).
- **Edit** saves product fields with `PATCH /admin/products/:id`; variant rows save individually (`POST` / `PATCH` / `DELETE …/variants/:variantId`) with per-row saving/saved/error indicators so one bad row doesn't block the rest.
- Client validation mirrors the DTOs: name 2–160, slug pattern, price ≥ 0 with 2 decimals, compare-at > price, stock integer ≥ 0, unique labels, at least one variant. Server 400/409 messages are mapped back onto fields.
- Leaving with unsaved changes prompts a confirm dialog.

### 4.5 Image upload component

- Accepts drag & drop, paste, or file picker; `accept="image/jpeg,image/png,image/webp,image/avif"`.
- Pre-checks size ≤ 5 MB (server enforces too) and shows an instant local preview (`URL.createObjectURL`).
- Uploads one file per request (`POST /admin/products/:id/images`, multipart field `image`, plus `alt`, `sortOrder`) with a progress bar (XHR `upload.onprogress`); up to 3 in parallel.
- On success swaps the preview for the server's `thumbUrl`/`mediumUrl`; on failure shows the server message on that tile with Retry.
- Delete = `DELETE /admin/products/:id/images/:imageId` after confirm.

### 4.6 Orders — `/orders`, `/orders/:id`

- List: status tabs with counts (from dashboard `ordersByStatus`), search (order number / email), date range, table (order no., customer, items, total, status badge, payment status, placed at).
- Detail: header with status badge and **only the allowed actions** (`allowedTransitions` from the API — e.g. "Mark processing", "Mark shipped", "Cancel order"); items with snapshot images; totals breakdown; shipping & billing addresses; payment status. Cancelling a paid order shows a warning that the refund must be issued in the payment dashboard.

### 4.7 Coupons — `/coupons`

Table (code, type, value, min subtotal, usage `used/limit`, validity window, active) + drawer form. Percentage vs fixed toggles the value suffix (% / ₹) and shows "Max discount" only for percentages.

### 4.8 Messages — `/messages`

Inbox list of contact submissions (newest first), detail pane, "Mark resolved".

---

## 5. Component structure

```
src/
├── main.tsx
├── app/
│   ├── router.tsx                 lazy routes, auth-guarded layout route
│   ├── store.ts                   RTK store + RTK Query middleware
│   └── providers.tsx
├── api/
│   ├── baseApi.ts                 fetchBaseQuery + bearer token + 401 → refresh → retry
│   ├── auth.api.ts
│   ├── dashboard.api.ts
│   ├── categories.api.ts          tags: Category
│   ├── products.api.ts            tags: Product, Variant, ProductImage
│   ├── orders.api.ts              tags: Order
│   ├── coupons.api.ts             tags: Coupon
│   └── types.ts                   generated from /api/docs-json (openapi-typescript)
├── features/
│   ├── auth/        LoginPage, RequireAdmin, authSlice (access token in memory)
│   ├── dashboard/   DashboardPage, KpiCard, SalesChart, StatusBreakdown, LowStockList, RecentOrders
│   ├── categories/  CategoriesPage, CategoryTreeTable, CategoryDrawer, DeleteCategoryDialog
│   ├── products/    ProductsPage, ProductFilters, ProductsTable, ProductFormPage,
│   │                VariantsEditor, VariantRow, ProductImagesField, ProductStatusCard
│   ├── orders/      OrdersPage, OrdersTable, OrderDetailPage, OrderStatusActions, OrderTotals
│   ├── coupons/     CouponsPage, CouponDrawer
│   └── messages/    MessagesPage
├── components/
│   ├── layout/      AppShell, TopBar, Sidebar, PageHeader, Breadcrumbs, GlobalSearch
│   └── ui/          Button, IconButton, Input, Textarea, Select, Switch, Checkbox, Badge,
│                    StatusBadge, StockPill, Card, Table (+ TableSkeleton), Pagination,
│                    Drawer, Dialog, ConfirmDialog, Tabs, SegmentedControl, EmptyState,
│                    Spinner, ImageUploader, PriceInput (₹, 2 decimals), FormField
├── hooks/           useDebouncedValue, useUrlState (filters ↔ query string), useUnsavedChanges
├── lib/             money (format ₹), dates, zod schemas mirroring DTOs
└── styles/          theme.css (tokens above), base.css
```

Conventions

- Pages own data fetching (RTK Query hooks) and pass plain props down; `components/ui` is stateless and theme-only.
- Every list page = `PageHeader` + `Card(Filters)` + `Card(Table + Pagination)`.
- Mutations invalidate tags (e.g. creating a variant invalidates `Product:id` and `Product:LIST`), so tables refresh without manual refetch.

### Example: tag-invalidating API slice

```ts
export const productsApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    listProducts: build.query<Paginated<AdminProductListItem>, AdminProductQuery>({
      query: (params) => ({ url: '/admin/products', params }),
      providesTags: (result) => [
        { type: 'Product', id: 'LIST' },
        ...(result?.data.map(({ id }) => ({ type: 'Product' as const, id })) ?? []),
      ],
    }),
    updateVariant: build.mutation<AdminVariant, { productId: string; variantId: string; body: UpdateVariant }>({
      query: ({ productId, variantId, body }) => ({ url: `/admin/products/${productId}/variants/${variantId}`, method: 'PATCH', body }),
      invalidatesTags: (_r, _e, { productId }) => [{ type: 'Product', id: productId }, { type: 'Product', id: 'LIST' }],
    }),
  }),
});
```

### Example: themed primitive

```tsx
const variants = {
  primary: 'bg-primary text-white hover:bg-primary-hover',
  cta: 'bg-cta text-white hover:brightness-95 shadow-card',
  secondary: 'bg-surface text-ink border border-border hover:bg-surface-muted',
  danger: 'bg-surface text-danger border border-danger/30 hover:bg-danger-soft',
} as const;

export function Button({ variant = 'secondary', loading, className, children, ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex h-9 items-center gap-2 rounded-sm px-4 text-sm font-semibold transition',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-50',
        variants[variant],
        className,
      )}
      disabled={loading || props.disabled}
      {...props}
    >
      {loading && <Spinner className="size-4" />}
      {children}
    </button>
  );
}
```

---

## 6. Auth in the admin app

- Login form → `POST /auth/login`; reject (and show "This account is not an administrator") when `user.role !== 'admin'`.
- Access token kept **in memory** (Redux), refresh token in `sessionStorage` (cleared when the tab closes). `baseApi` retries once after `POST /auth/refresh` on a 401; a failed refresh routes to `/login`.
- Recommended hardening when deploying under the same site as the API: move the refresh token to an httpOnly, `SameSite=Strict` cookie (backend change noted in README).
- Idle timeout: sign out after 30 minutes without interaction.

## 7. Performance & quality checklist

- Route-level code splitting; Recharts loaded only on the dashboard.
- Tables are server-paginated (never fetch everything); thumbnails use the 200 px `thumbUrl` with `loading="lazy"` and fixed dimensions.
- Debounced search; filters in the URL; RTK Query cache keeps back-navigation instant.
- Skeleton rows instead of spinners; optimistic toggles for active/featured switches.
- Keyboard: `/` focuses global search, `n` opens "Add product" on the products page, `Esc` closes drawers; drawers and dialogs trap focus.
- Accessibility: labelled inputs, `aria-live` for toasts and save status, status text alongside colour.
- Testing: Vitest + Testing Library for forms (validation, variant editor), Playwright smoke test (login → create product with image → see it on the storefront API).
