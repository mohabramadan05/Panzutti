# Panzutti — project handoff for Claude Code

This file is the starting context for anyone (or any AI agent) continuing this project. Read it fully before changing code.

Owner: Mohab. Client: **Panzutti**, a panuozzo (wood-fired Neapolitan sandwich-pizza) restaurant in Cairo, Egypt. Current live site: https://panzutti.com/en

---

## 1. Status

| Part | Status |
|---|---|
| Supabase database (20 tables, RLS, RPCs, triggers, storage, realtime, email queue) | ✅ Live on project `dpwsssmwarxntplorgtl` |
| `send-emails` Edge Function (Gmail SMTP) | ✅ Deployed, waiting for Gmail secrets |
| Next.js website: **home page** (`/en`, `/ar`) | ✅ Built, `npm run build` passes |
| **Menu page** (`/en/menu`, `/ar/menu`): sticky category tabs, scroll-spy, search | ✅ Built |
| Pizza assembly animation (home page, `motion`) | ✅ Built |
| "Making of" page `/[locale]/pizza`: dark theme, pinned GSAP ScrollTrigger scroll-scrub, real ingredient photos (Unsplash crops in `lib/pizza-photos.ts`) | ✅ Built (not linked from nav yet) |
| Item page `/menu/[slug]` (add-on rules), cart `/cart` (+ checkout suggestions), checkout `/checkout` (promo, cash/InstaPay, `place_order`), confirmation `/order?n=` (status via `track_order` polling, InstaPay screenshot upload) | ✅ Built — tested end to end with a pickup/cash order (#1000, a TEST order) |
| Order tracking `/track` (phone, optional order number) | ✅ Built |
| Welcome pop-up on the home page (`components/welcome-popup.tsx`, character `public/brand/character-welcome.jpg`, shown once per browser, picks delivery/pickup) | ✅ Built |
| Full PDF menu in the DB (39 items + photos + Arabic) | ✅ Loaded |
| Animated delivery scene on the order page (`components/delivery-scene.tsx` + `.css`: SVG shop → scooter → house, follows the live status; pickup shows a bag at the shop) | ✅ Built |
| Table reservations `/reserve` (date, 30-min slot, guests, pre-ordered food → checkout as type "reservation"; `lib/reservation.ts`, `components/reservation-picker.tsx`) + 14% VAT on every order and 12% service on reservations (`estimateTotals()` in `lib/cart.tsx`) | ✅ Built — **needs `database/panzutti_supabase_v4.sql` run** (until then reservations fail and totals have no VAT) |
| Images self-hosted: menu photos `public/menu/<slug>.webp` (`localMenuImage()` in `lib/data.ts`), mascot poses `public/mascots/*.webp` (`MASCOTS` in `lib/brand.ts`, `<Mascot pose>`), /pizza photos `public/pizza`. Logo is a text wordmark (old logo PNGs are gone from panzutti.com) | ✅ |
| Scroll animations: `[data-reveal]` + `components/scroll-reveal.tsx` (mounted in the locale layout) | ✅ |
| Loyalty points per phone (`database/panzutti_supabase_v5.sql`; checkout card in `checkout-form.tsx` via `get_loyalty`; admin page `/loyalty` in Panzutti-Admin; customer balance page `/[locale]/points` with the animated mascot, `components/points-check.tsx`, linked in header + footer) | ✅ Built, v5 live |
| Realtime instead of polling, scheduled delivery/pickup orders | ⏳ Next |
| Google sign-in, account, saved addresses | ⏳ Next |
| Panzutti Family wall `/family` + share page `/family/share` (anyone can upload with a name; optional Google sign-in adds "your photos"; every photo needs admin approval) | ✅ Built — guest upload needs the v3 (2) SQL run (see section 8) |
| Join our team `/careers` + Become a supplier `/suppliers` (shared `components/application-form.tsx` → optional file to `applications/incoming/…` → `submit_application`; open positions/categories via `getJoinData()`) | ✅ Built — validation tested; no real application sent yet |
| Admin / staff panel — **separate project `D:\work\Panzutti-Admin`** (port 3001; orders board with Realtime, InstaPay review, sold-out/prices, family photos, applications, reports). See its README for giving staff access | ✅ Built — untested with a real login until the first admin account exists |
| Roles: admin, staff, cashier (no reports), driver (admin panel `/deliveries` only); admin creates users and sets roles at `/users` (`database/panzutti_supabase_v6.sql` + Edge Function `supabase/functions/admin-users`) | ✅ Built — **needs v6 SQL run + `admin-users` deployed** |

### How we got here
1. Analysed panzutti.com.
2. Designed the database. Scope: users, menu with add-ons and required choice groups, orders with history, promo codes and branches (same menu in every branch). Payment is cash only, with no payment gateway. The cart lives in the browser, not the database.
3. Added saved addresses and sales reports, then created everything in Supabase through the MCP connector.
4. v2 additions:
   - Google sign-in.
   - Gmail SMTP emails for delivery orders.
   - Checkout suggestions (drinks, desserts).
   - InstaPay as a second payment method, with transfer-screenshot uploads.
   - The "Panzutti Family" gallery: users upload photos, admin approves.
   - "Join our team" job applications and a service-provider form.
5. Started this Next.js site from the Lovable design (`design-reference/`), enhanced it, and built the home page only.

---

## 2. Run it

```bash
npm install
npm run dev          # http://localhost:3000 → redirects to /en (or /ar for Arabic browsers)
npm run build        # must pass (type check + lint) before you finish any task
```

`.env.local` (public values only — safe to commit as-is, but it is git-ignored):
```
NEXT_PUBLIC_SUPABASE_URL=https://dpwsssmwarxntplorgtl.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...   (see .env.local)
NEXT_PUBLIC_SITE_URL=http://localhost:3000
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=...       (optional; browser key restricted by HTTP referrer, Maps JavaScript API + Geocoding API)
```
Checkout delivery map: `components/location-picker.tsx`. With the key, a draggable Google map under a fixed pin (each pin reverse-geocodes into the address field: Google Geocoder, falling back to OpenStreetMap Nominatim). Without it, "Use my location" (GPS) and a keyless Google Maps embed preview. Orders have no lat/lng columns, so the pin is appended to `p_delivery_notes` as a `📍 https://www.google.com/maps?q=lat,lng` line. The pin is saved with the guest's details in `panzutti-customer-v1`.
Never put the service-role key, Gmail password or any secret in the frontend or in this repo.

---

## 3. Folder map

```
D:\work\Panzutti
├─ CLAUDE.md                     ← this file
├─ README.md                     ← short human setup guide
├─ src/
│  ├─ app/
│  │  ├─ globals.css             ← Tailwind v4 @theme brand tokens, fonts, animations, utilities
│  │  └─ [locale]/
│  │     ├─ layout.tsx           ← <html lang dir>, metadata (en/ar alternates, OG)
│  │     ├─ page.tsx             ← HOME PAGE (server component, revalidate = 300)
│  │     ├─ menu/page.tsx        ← MENU PAGE (getMenuData(), revalidate = 300)
│  │     ├─ pizza/page.tsx       ← standalone dark "making of" page (own top bar, no SiteHeader/Footer)
│  │     └─ not-found.tsx        ← mascot 404
│  ├─ components/
│  │  ├─ brand.tsx               ← Logo (red/cream), Mascot (the curly-haired character; `point="start"|"end"` mirrors him to point at the content in EN and AR), SectionTitle
│  │  ├─ site-header.tsx         ← "use client": sticky header, nav, language switch, mobile menu
│  │  ├─ site-footer.tsx
│  │  ├─ product-card.tsx
│  │  ├─ menu-browser.tsx        ← "use client": sticky tabs, scroll-spy, search for /menu
│  │  ├─ pizza-assembly.tsx/.css ← "use client": step-by-step pizza build (motion/react, useReducedMotion)
│  │  └─ pizza-scrollytelling.tsx ← "use client": GSAP + ScrollTrigger pin/scrub (useGSAP, gsap.matchMedia for reduced motion)
│  ├─ lib/
│  │  ├─ i18n.ts                 ← locales ["en","ar"], dirOf(), full EN/AR dictionaries
│  │  ├─ supabase.ts             ← anon client (null if env missing)
│  │  ├─ data.ts                 ← getHomeData(), getMenuData(), types, fallback data, openStatus(); withImage() borrows Cloudinary photos by slug while image_url is NULL
│  │  ├─ format.ts               ← egp(piasters, locale), timeLabel(), telHref()
│  │  ├─ brand.ts                ← image URLs, socials, email, maps link
│  │  └─ utils.ts                ← cn()
│  └─ middleware.ts              ← adds /en or /ar to paths without a locale
├─ database/
│  ├─ panzutti_supabase.sql      ← v1 script (run first)
│  ├─ panzutti_supabase_v2.sql   ← v2 script (run second)
│  ├─ PANZUTTI_DATABASE.md       ← full database documentation — READ for any backend work
│  └─ panzutti-supabase-erd.pdf/.png
├─ supabase/functions/send-emails/index.ts   ← Deno Edge Function (excluded from tsconfig/eslint)
└─ design-reference/             ← Lovable design source (READ-ONLY reference, excluded from build)
```

---

## 4. Tech stack & conventions

- **Next.js 15.5 App Router**, React 19, TypeScript strict, **Tailwind CSS v4**. There is no tailwind.config: tokens live in `@theme` in `globals.css`.
- Icons: `lucide-react`. Class helper: `cn()` (clsx + tailwind-merge).
- Fonts are self-hosted through `@fontsource`; Google Fonts is not used.
- **i18n:** every page lives under `src/app/[locale]/`.
  - Add each string to **both** `en` and `ar` in `lib/i18n.ts`. The `Dictionary` type enforces matching keys.
  - Arabic is RTL: use logical utilities (`ms-`, `me-`, `ps-`, `pe-`, `start-`, `end-`, `text-start`), never `ml-`/`mr-`/`left-`/`right-`.
  - Flip directional icons with `rtl:rotate-180`.
  - Headings switch to the Lalezar font automatically in RTL.
- **Data:**
  - Server components fetch through `lib/data.ts`.
  - Always use a timeout and a fallback, so a page renders even when Supabase is unreachable.
  - Client components use the same `supabase` client for user actions (cart, checkout, uploads).
- **Money:**
  - All prices in the DB are **integer piasters** (1 EGP = 100).
  - Display with `egp(price, locale)`.
  - Never compute final totals on the client as truth; `place_order` returns the real totals.
- **Bilingual DB columns:** `name_en`/`name_ar`, `description_en`/`description_ar`, `address_en`/`address_ar`. Pick by locale and fall back to `_en` when `_ar` is null.
- **Images:**
  - `next/image` with `remotePatterns` for `panzutti.com`, `res.cloudinary.com` and `*.supabase.co` (see `next.config.ts`).
  - Brand photos currently load from the old panzutti.com site, and menu photos from Cloudinary. `menu_items.image_url` is now filled with the live site's Cloudinary URLs (2026-10-24, see `database/panzutti_menu_seed.sql`; Brisket Sesame, Lemon Mint and Espresso have no photo). **TODO:** move photos into the `menu-images` bucket and self-host the brand photos in `lib/brand.ts`.
- **Dev-mode hang gotcha:** don't pass the whole dictionary `t` (or the `branch` object) as props to a *server* component on a page that also passes pieces of the same objects to client components. In `npm run dev`, React serializes server-component props for debugging and the shared references made HTML responses hang forever (production was fine). `SiteFooter` therefore takes only `locale` and loads its own data; `getMenuData()` is wrapped in React `cache()` so that costs no extra request.
- Don't run `npm run build` while `npm run dev` is running: both use `.next` and the dev server breaks (500s) until restarted.
- Respect `prefers-reduced-motion` (already handled in globals.css).
- Mobile first: test at 390px, and never allow horizontal scrolling.

---

## 5. Design reference

### Sources
| Reference | Where | Use it for |
|---|---|---|
| Lovable design source | `design-reference/` (copied from `C:\Users\AdminLocal\Downloads\panzutti-ui-source\panzutti-source\`) | Look & layout of each page. TanStack Start + Vite + shadcn — **port the look, not the code**. |
| Pages to port | `design-reference/src/routes/` | `menu.index.tsx`, `menu.$slug.tsx`, `cart.tsx`, `checkout.tsx`, `order.tsx`, `track.$token.tsx`, `auth.tsx`, `contact.tsx`, `policies.$key.tsx`, `_authenticated/account.tsx`, `_authenticated/orders.*`, `_authenticated/admin.*` |
| Components | `design-reference/src/components/` | `order-bar.tsx`, `order-view.tsx`, `track-view.tsx`, `product-card.tsx`, `ui/*` (shadcn) |
| Styles | `design-reference/src/styles.css` | Original tokens (already ported to `globals.css`) |
| Live site | https://panzutti.com/en | Real content: menu, prices, photos, address, hours, socials |

> ⚠️ `design-reference/supabase/` and `design-reference/src/integrations/supabase/` belong to Lovable's **own, different** database: reservations, loyalty points, journal, drivers and reviews. **Do not** use those tables or migrations. Our database is the one in `database/` (section 6). Club, reservations, journal and loyalty pages are **out of scope** unless the owner asks for them.
> The Lovable `src/assets/*.asset.json` files only point to Lovable hosting; they contain no real images.

### Brand tokens (in `globals.css`)
| Token | Value |
|---|---|
| brand-green (primary) | `#1F6348` (dark `#154733`) |
| brand-red (CTA / stickers) | `#C01D2E` |
| brand-cream (background) | `#FFF2D0` |
| brand-yellow (highlights, Family section) | `#FED900` |
| foreground | `#16352A` |
| card / muted / border | `#FFFAEC` / `#F6E9C6` / `#ECDCB0` |

Fonts: **Fraunces** (headings), **DM Sans** (body), **Yellowtail** (`font-script` accent lines like "Favorite Bite."), **Lalezar** (`font-arabic`, Arabic headings). Utilities: `grain`, `animate-marquee`, `animate-float`, `animate-fade-up`.

### Design language
**Mascot = the curly-haired Panzutti character** (`public/brand/character.webp`, a transparent cut-out of `character-welcome.jpg`; the old pizza mascot from panzutti.com is no longer used). He appears in the home hero, beside the bestsellers, in the "Build it with us" section (not in the footer any more), in the menu/careers/family/suppliers/track headers, the welcome pop-up and empty/404 states. Rounded-3xl cards, pill buttons, a red rotated sticker on photos, polaroid frames, the floating mascot, a red marquee strip, a dark-green story section with the "على إيدك" badge, a yellow Family section and a dark-green footer. Keep new pages consistent with the home page.

### Restaurant facts
- Branch: Meraki Complex, Air Force House, El Golf, Salah Salem, Cairo.
- Open daily 9:00 AM – 2:00 AM (closes after midnight; `openStatus()` handles it).
- Phone 01041093713. Email info@panzutti.com.
- Instagram, TikTok and Facebook: `@panzuttiegypt`.
- Delivery to Heliopolis and Nasr City, plus pickup.

---

## 6. Database (Supabase) — what the frontend calls

Full details: `database/PANZUTTI_DATABASE.md`. Project ref `dpwsssmwarxntplorgtl`, Postgres 17, **RLS on every table**.

### Tables (20)
- **Accounts:** `profiles`, `customer_addresses`, `branches`, `app_settings`
- **Menu:** `menu_categories`, `menu_items`, `addon_groups`, `addons`, `menu_item_addon_groups`
- **Orders:** `promo_codes`, `orders`, `order_items`, `order_item_addons`, `order_status_history`
- **Payments & email:** `payment_proofs`, `email_outbox`
- **Community:** `family_photos`, `job_positions`, `service_categories`, `applications`

### Enums
- `user_role`: customer, staff, admin, cashier, driver (v6)
- `order_type`: pickup, delivery
- `order_status`: pending, confirmed, preparing, ready, out_for_delivery, completed, cancelled
- `payment_status`: unpaid, paid
- `payment_method`: cash, instapay
- `discount_type`: percent, fixed
- `review_status`: pending, approved, rejected
- `application_type`: job, service_provider
- `application_status`: new, reviewing, contacted, accepted, rejected

### Public RPCs (anon + authenticated)
| RPC | Purpose |
|---|---|
| `get_menu()` → jsonb | Categories → items → addon_groups → addons (only active items) |
| `validate_promo_code(p_code, p_branch_id, p_type, p_subtotal, p_phone?)` → `{promo_id, promo_code, discount_amount}` | Promo preview at checkout (raises an error if invalid) |
| `get_checkout_suggestions(p_cart_item_ids uuid[], p_limit int = 6)` | "Add a drink?" suggestions. `has_required_choices = true` → open the item modal instead of adding directly. |
| `place_order(p_branch_id, p_type, p_customer_name, p_customer_phone, p_items jsonb, p_delivery_address?, p_delivery_notes?, p_note?, p_scheduled_for?, p_promo_code?, p_locale='en', p_address_id?, p_save_address=false, p_address_label?, p_payment_method='cash', p_customer_email?)` | Creates the order **server-side with server prices**. Returns `{order_id, order_number, status, payment_method, instapay_address, subtotal, discount_total, delivery_fee, total}`. |
| `track_order(p_order_number bigint, p_phone text)` | Guest order tracking |
| `submit_payment_proof(p_order_id, p_phone, p_file_path, p_reference?)` | After uploading an InstaPay screenshot |
| `get_family_gallery(p_limit=30, p_offset=0)` | Approved photos → then `storage.from('panzutti-family').createSignedUrls(paths, 3600)` |
| `submit_family_photo(p_file_path, p_caption?)` | Logged-in users only |
| `submit_application(p_type, p_full_name, p_phone, p_email, p_message?, p_job_position_id?, p_position_other?, p_service_category_id?, p_company_name?, p_attachment_path?, p_locale='en')` → uuid | Job (`job`) or supplier (`service_provider`) form; read `job_positions` / `service_categories` for the dropdowns |

`p_items` format:
```json
[{ "menu_item_id": "uuid", "quantity": 2, "note": "no onions",
   "addons": [{ "addon_id": "uuid", "quantity": 1 }] }]
```
The server validates sold-out items, required groups (`min_select`/`max_select`), `max_quantity`, branch hours, delivery minimum and the promo code. Show its error messages to the user.

### Staff/admin RPCs (authenticated, role checked inside)
- Orders and menu: `update_order_status(p_order_id, p_status, p_reason?)`, `mark_order_paid`, `set_menu_item_sold_out`, `set_addon_sold_out`
- Reviews: `review_payment_proof(p_proof_id, p_approve, p_note?)`, `review_family_photo(p_photo_id, p_approve, p_note?)`
- Reports (`p_from date, p_to date, p_branch_id?`): `report_daily_sales`, `report_branch_summary`, `report_top_items`, `report_top_addons`, `report_category_sales`, `report_hourly_sales`, `report_promo_usage`, `report_staff_activity`, `report_payment_methods`

### Storage buckets
| Bucket | Access | Path rule |
|---|---|---|
| `menu-images` | public | admin uploads |
| `payment-proofs` | private | `<order_id>/<file>`; jpg/png/webp/heic/pdf, ≤5 MB |
| `panzutti-family` | private (signed URLs) | `<auth.uid()>/<file>`; images ≤8 MB |
| `applications` | private (admin read) | `incoming/<random id>/<file>`; pdf/doc/image ≤10 MB |

**Realtime** is on for `orders`, `order_status_history` and `payment_proofs`; use it for live tracking and the staff board.

### Business rules to keep in mind
- Orders can be placed by guests. Logged-in users get `customer_id` set and can save addresses.
- An InstaPay order **cannot be completed until a proof is approved**. A cash order is marked paid automatically when completed.
- Rejected proofs can be re-uploaded up to 5 times. Uploads close 3 days after the order.
- Family photos: 10 uploads/day, 5 pending at most. Admin uploads publish immediately as "official".
- Applications: 3 per phone or email per day.
- Emails are queued in `email_outbox` and sent by pg_net → `send-emails` with a 5-minute pg_cron retry. A failed email never blocks an order.
- `place_order_v1` is the old v1 function, renamed and revoked. Don't use it.

---

## 7. Suggested next steps (in order)

1. ~~Menu page~~ ✅ done.
2. ~~Item page, cart, checkout, InstaPay step, confirmation~~ ✅ done. How it fits together:
   - `lib/cart.tsx`: `CartProvider` (in the locale layout) + `useCart()`; localStorage key `panzutti-cart-v1`; `toOrderItems()` builds `p_items`; `freshen()` re-prices lines against `lib/catalog.ts` (built server-side from `get_menu`) so sold-out/removed items block checkout.
   - `components/item-configurator.tsx`: add-on groups (radio when `max_select = 1`, checkboxes otherwise, per-add-on stepper when `max_quantity > 1`, defaults pre-picked, required groups enforced).
   - `components/checkout-form.tsx`: guest details remembered in `panzutti-customer-v1`; promo is dropped when type/subtotal changes; server error messages are shown as-is (they are English only).
   - `lib/last-order.ts`: the placed order (+ phone) in localStorage `panzutti-last-order-v1`; `/order?n=` reads it, so it only works on the device that ordered.
   - InstaPay only appears when `branches.accepts_instapay` and `instapay_address` are set. Tested end to end on 2026-10-23 (order #1001: place → upload → `submit_payment_proof` → proof `pending`, email queued).
   - Still to do here: saved addresses for logged-in users (needs sign-in), scheduled orders (`p_scheduled_for`).
3. ~~Order tracking~~ ✅ `/[locale]/track` (`components/track-order.tsx`): phone required, order number optional. Phone only → `find_orders_by_phone` (v3, last 3 days, no PII) list; number → `track_order` detail via the shared `OrderStatus` component (also used by `/order` through `OrderConfirmation`). Unpaid InstaPay orders show the payment/upload card first. Linked in header and footer.
   - Still to do: Realtime instead of the 30 s polling; rate limiting / SMS verification (order numbers are sequential, so the phone is effectively the key — see `PANZUTTI_DATABASE.md` §11).
7. **Google sign-in** (`supabase.auth.signInWithOAuth({ provider: 'google' })`), switching to `@supabase/ssr` for cookie sessions, and an account page with orders and addresses.
8. ~~Panzutti Family page~~ ✅ `components/family-wall.tsx` (masonry polaroids, "show more" via `get_family_gallery` offset, `<dialog>` lightbox) and `components/family-share.tsx` (uses `lib/supabase-browser.ts`, a session-keeping PKCE client; hides the Google button when `/auth/v1/settings` says Google is off). Shared fetch + bucket limits in `lib/family.ts`.
9. **Join our team / Become a supplier** forms.
10. **Admin dashboard**: orders board, proof review, gallery approval, applications, menu sold-out toggles, reports.
11. Self-host images; add SEO (sitemap, robots, JSON-LD Restaurant).

---

## 8. Things the owner still has to do (not code)
- **Run `database/panzutti_supabase_v4.sql`** (Supabase → SQL Editor, whole file): VAT, service charge, reservations, phone-only tracking. Then redeploy the `send-emails` Edge Function (it now prints VAT/service lines). The admin panel already shows reservations (board filter "tables", dashboard list), VAT/service lines and a VAT report (`report_tax_summary`, also in v4).
- Drop the real logo files into `public/brand/` and render them in `Logo` (`components/brand.tsx`) — the old panzutti.com logo/photo URLs return 404.
- **Run the guest-upload SQL** (not applied yet — the migration tool was declined): Supabase → SQL Editor → paste the section `v3 (2)` of `database/panzutti_supabase_v3.sql` (from `CREATE OR REPLACE FUNCTION public.guest_family_upload_allowed()` to the end) → Run. Until then, guests on `/family/share` get an upload error; signed-in sharing is unaffected.
- Supabase → Edge Functions → Secrets: add `GMAIL_USER` and `GMAIL_APP_PASSWORD` (a Gmail App Password). Optionally add `SITE_URL` and `EMAIL_REPLY_TO`.
- Enable the Google provider in Supabase Auth. Redirect URI: `https://dpwsssmwarxntplorgtl.supabase.co/auth/v1/callback`. Also add the site under Auth → URL Configuration → Redirect URLs (`http://localhost:3000/**`, `https://panzutti.com/**`) or the family share sign-in will bounce. Until Google is on, `/family/share` shows "sign-in isn't switched on yet".
- **Replace the TEST InstaPay address before launch.** It is currently `panzutti-test@instapay` (set 2026-10-23 so the flow could be tested), and customers would see it: `update branches set instapay_address = '<real address>' where slug = 'meraki-salah-salem';` Setting it back to NULL hides InstaPay again.
- Cancel the test orders **#1000** (cash) and **#1001** (InstaPay, with a pending 1×1 test screenshot in `payment-proofs`), e.g. by rejecting/cancelling them from the admin side once it exists, or in SQL.
- Change `app_settings` emails (currently `mohab.ramadan05@gmail.com` for testing) before launch.
- Make the first admin: `update profiles set role='admin' where email='…';`
- Full menu from the PDF is loaded (39 items, prices from the live site, `database/panzutti_menu_seed.sql` — re-runnable). Still missing: the drinks that are only on the website (hot drinks, iced tea, frappe, smoothies, refreshers) and a photo for Brisket Sesame. Check the Arabic names/descriptions I wrote.

## 9. Rules for the agent
- Don't run destructive SQL (DROP, TRUNCATE, or UPDATE/DELETE without WHERE) on the live database without asking the owner.
- Put DB changes in a new numbered SQL file under `database/` (for example `panzutti_supabase_v3.sql`) and update `PANZUTTI_DATABASE.md`.
- Keep EN and AR in sync for every new string.
- Run `npm run build` before you say a task is done.