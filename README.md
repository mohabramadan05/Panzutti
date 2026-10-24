# Panzutti — website

Next.js 15 (App Router) + TypeScript + Tailwind CSS v4, connected to the Panzutti Supabase project.
Only the **home page** is built so far, in English (`/en`) and Arabic (`/ar`, right-to-left).

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:3000. It redirects to `/en`, or to `/ar` if your browser prefers Arabic.

Production build: `npm run build && npm start`

## Environment

Copy `.env.example` to `.env.local`. A ready `.env.local` is already included. It holds only public values: the Supabase URL and the publishable key.

| Variable | What it is |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Publishable (anon) key, safe in the browser |
| `NEXT_PUBLIC_SITE_URL` | Site address used for SEO links |

If Supabase can't be reached, the home page falls back to built-in sample menu data, so it always renders.

## Structure

```
src/
  app/[locale]/page.tsx     Home page (hero, bestsellers, story, how to order, Panzutti Family, join, visit)
  app/[locale]/layout.tsx   <html lang/dir>, metadata
  app/globals.css           Brand tokens (colours, fonts, animations) for Tailwind v4
  components/               Header, footer, product card, logo/mascot
  lib/i18n.ts               English + Arabic text
  lib/data.ts               Supabase queries (get_menu, branches, get_family_gallery) + fallback data
  middleware.ts             Language redirect
database/                   Supabase SQL scripts (v1, v2), database summary, ERD
supabase/functions/         send-emails edge function (Gmail SMTP)
```

## To do later

- **Images** are currently loaded from panzutti.com and Cloudinary (the old site). Download them into `/public` or Supabase Storage before the old site goes away, then update `src/lib/brand.ts` and `menu_items.image_url`.
- Next pages: menu, checkout (Cash / InstaPay upload), Panzutti Family upload, careers/suppliers forms, Google sign-in.
- Supabase: add `GMAIL_USER` / `GMAIL_APP_PASSWORD` secrets, enable Google OAuth, and set `branches.instapay_address`.
