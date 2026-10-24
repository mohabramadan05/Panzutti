<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Architecture rules
- Pricing, promo/reward discounts, points and reservation capacity live in Postgres SECURITY DEFINER functions (`price_cart`, `quote_order`, `place_order`, `create_reservation`, order status trigger). Why: the browser must never decide totals or points.
- Orders/reservations are only inserted via those RPCs; tables grant no INSERT to clients. Why: prevents forged orders.
- Admin access = `has_role(uid,'admin')` in RLS; admin UI uses the browser Supabase client under RLS. Why: one enforcement point.
- Site copy/config lives in `site_settings` (key → jsonb) and is edited from /admin/settings. Why: no hardcoded content.
- Media bucket `media` is private (workspace blocks public buckets); uploads store long-lived signed URLs. Why: workspace policy.
- Mascot artwork goes through `Mascot` in src/components/brand.tsx (MASCOT_ART map). Why: single swap point when official files arrive.
- Public data loads client-side with TanStack Query (`src/lib/data.ts`). Why: same RLS-backed client everywhere.
