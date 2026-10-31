-- =====================================================================
-- Panzutti — v7: points by order amount + team gallery (2026-10-31)
-- Run after v1 … v6. Safe to run again.
--
-- 1. Loyalty points are earned by the amount paid, not a fixed number per
--    order: 1 point for every app_settings.loyalty_earn_amount piasters
--    (default 1000 = 1 point per 10 EGP). The amount is the food after
--    discounts (subtotal − discount_total, so promo and points discounts
--    don't earn), without VAT, service or delivery. Rounded down.
--    loyalty_points_per_order is no longer used (kept so nothing breaks).
-- 2. Team gallery: team_photos (admin-managed, public read) and the public
--    bucket team-photos. The website shows active photos on /team.
-- =====================================================================

-- ---------------------------------------------------------------- 1. points by amount
ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS loyalty_earn_amount integer NOT NULL DEFAULT 1000 CHECK (loyalty_earn_amount > 0); -- piasters per point

COMMENT ON COLUMN public.app_settings.loyalty_points_per_order IS 'Unused since v7 (points are earned by amount, see loyalty_earn_amount).';

CREATE OR REPLACE FUNCTION public.orders_loyalty()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_set    public.app_settings%ROWTYPE;
  v_points integer;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'completed' AND NEW.points_earned = 0 THEN
    SELECT * INTO v_set FROM public.app_settings WHERE id;
    IF COALESCE(v_set.loyalty_enabled, false) THEN
      v_points := GREATEST(NEW.subtotal - NEW.discount_total, 0) / v_set.loyalty_earn_amount;
      IF v_points > 0 THEN
        PERFORM public.loyalty_apply(NEW.customer_phone, v_points, 'earn', NEW.id, NULL, NEW.customer_name);
        NEW.points_earned := v_points;
      END IF;
    END IF;
  END IF;

  IF NEW.status = 'cancelled' THEN
    -- give back points spent on this order (once)
    IF NEW.points_redeemed > 0 AND NOT EXISTS (
         SELECT 1 FROM public.loyalty_transactions WHERE order_id = NEW.id AND reason = 'refund') THEN
      PERFORM public.loyalty_apply(NEW.customer_phone, NEW.points_redeemed, 'refund', NEW.id);
    END IF;
    -- completed then cancelled: take the earned points back
    IF NEW.points_earned > 0 THEN
      PERFORM public.loyalty_apply(NEW.customer_phone, -NEW.points_earned, 'reverse', NEW.id);
      NEW.points_earned := 0;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_loyalty(p_phone text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_set   public.app_settings%ROWTYPE;
  v_phone text := public.normalize_phone(p_phone);
BEGIN
  SELECT * INTO v_set FROM public.app_settings WHERE id;
  IF NOT COALESCE(v_set.loyalty_enabled, false) THEN
    RETURN jsonb_build_object('enabled', false);
  END IF;
  RETURN jsonb_build_object(
    'enabled', true,
    'points', COALESCE((SELECT points FROM public.loyalty_accounts WHERE phone = v_phone), 0),
    'earn_amount', v_set.loyalty_earn_amount,
    'redeem_points', v_set.loyalty_redeem_points,
    'redeem_value', v_set.loyalty_redeem_value);
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_loyalty(text) TO anon, authenticated;

-- ---------------------------------------------------------------- 2. team gallery
CREATE TABLE IF NOT EXISTS public.team_photos (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  file_path   text NOT NULL,                          -- path in the team-photos bucket
  name        text,                                   -- staff member's name (optional, e.g. for group photos)
  role_en     text,
  role_ar     text,
  sort_order  integer NOT NULL DEFAULT 0,             -- lower first
  is_active   boolean NOT NULL DEFAULT true,
  created_by  uuid REFERENCES public.profiles(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS team_photos_public_idx ON public.team_photos (is_active, sort_order, created_at DESC);
DROP TRIGGER IF EXISTS team_photos_updated_at ON public.team_photos;
CREATE TRIGGER team_photos_updated_at BEFORE UPDATE ON public.team_photos
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.team_photos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "View team photos" ON public.team_photos;
CREATE POLICY "View team photos" ON public.team_photos FOR SELECT TO anon, authenticated
  USING (is_active OR (SELECT public.is_admin()));
DROP POLICY IF EXISTS "Admins insert team photos" ON public.team_photos;
CREATE POLICY "Admins insert team photos" ON public.team_photos FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.is_admin()));
DROP POLICY IF EXISTS "Admins update team photos" ON public.team_photos;
CREATE POLICY "Admins update team photos" ON public.team_photos FOR UPDATE TO authenticated
  USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));
DROP POLICY IF EXISTS "Admins delete team photos" ON public.team_photos;
CREATE POLICY "Admins delete team photos" ON public.team_photos FOR DELETE TO authenticated
  USING ((SELECT public.is_admin()));
GRANT SELECT ON public.team_photos TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.team_photos TO authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'storage' AND table_name = 'buckets') THEN
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES ('team-photos', 'team-photos', true, 8388608, ARRAY['image/jpeg','image/png','image/webp'])
    ON CONFLICT (id) DO NOTHING;

    DROP POLICY IF EXISTS "Admins upload team photos" ON storage.objects;
    CREATE POLICY "Admins upload team photos" ON storage.objects
      FOR INSERT TO authenticated
      WITH CHECK (bucket_id = 'team-photos' AND public.is_admin());
    DROP POLICY IF EXISTS "Admins delete team photo files" ON storage.objects;
    CREATE POLICY "Admins delete team photo files" ON storage.objects
      FOR DELETE TO authenticated
      USING (bucket_id = 'team-photos' AND public.is_admin());
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
