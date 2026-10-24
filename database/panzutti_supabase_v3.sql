-- =====================================================================
-- Panzutti — v3: look up recent orders by phone (for the /track page)
-- Run after panzutti_supabase.sql and panzutti_supabase_v2.sql.
--
-- find_orders_by_phone(p_phone) returns a SHORT list (last 3 days, max 10)
-- with no name, address or items. Full details still go through
-- track_order(order_number, phone).
--
-- Privacy note: order numbers are sequential, so the phone number is
-- effectively the key for guests anyway. Before launch, add rate limiting
-- (or SMS verification) for find_orders_by_phone and track_order.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.find_orders_by_phone(p_phone text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_phone text := public.normalize_phone(p_phone);
BEGIN
  IF v_phone IS NULL THEN
    RAISE EXCEPTION 'Please enter a valid phone number';
  END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(x ORDER BY x.created_at DESC)
    FROM (
      SELECT o.order_number, o.status, o.type, o.payment_method, o.payment_status,
             o.total, o.created_at
      FROM public.orders o
      WHERE o.customer_phone = v_phone
        AND o.created_at > now() - interval '3 days'
      ORDER BY o.created_at DESC
      LIMIT 10
    ) x
  ), '[]'::jsonb);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.find_orders_by_phone(text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.find_orders_by_phone(text) TO anon, authenticated;


-- =====================================================================
-- v3 (2): Panzutti Family — anyone can share a photo, admin approves first
--
-- Guests (no account) upload to 'panzutti-family/guest/<random>.<ext>',
-- then call submit_guest_family_photo(path, name, caption).
-- Every guest photo is 'pending' and only appears on the wall after
-- review_family_photo(..., true). Signed-in users keep the v2 flow.
--
-- No account = no per-person limit, so guest uploads are capped globally:
--   * 30 guest files per hour (storage rule)
--   * 100 guest photos waiting for review at once (submit function)
-- Rejected or never-submitted guest files stay in the bucket; admins can
-- delete them from Storage. Add a captcha before launch if spam appears.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.guest_family_upload_allowed()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT (SELECT count(*) FROM storage.objects
          WHERE bucket_id = 'panzutti-family'
            AND name LIKE 'guest/%'
            AND created_at > now() - interval '1 hour') < 30;
$$;

DROP POLICY IF EXISTS "Guest upload family photo" ON storage.objects;
CREATE POLICY "Guest upload family photo" ON storage.objects
  FOR INSERT TO anon, authenticated
  WITH CHECK (bucket_id = 'panzutti-family'
              AND split_part(name, '/', 1) = 'guest'
              AND public.guest_family_upload_allowed());

CREATE OR REPLACE FUNCTION public.submit_guest_family_photo(
  p_file_path text,
  p_name      text,
  p_caption   text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_name text := NULLIF(trim(p_name), '');
  v_set  public.app_settings%ROWTYPE;
  v_id   uuid;
BEGIN
  IF v_name IS NULL THEN
    RAISE EXCEPTION 'Please enter your name';
  END IF;
  IF length(v_name) > 60 OR length(COALESCE(p_caption, '')) > 300 THEN
    RAISE EXCEPTION 'Name or caption is too long';
  END IF;
  IF split_part(p_file_path, '/', 1) <> 'guest' THEN
    RAISE EXCEPTION 'Invalid photo';
  END IF;
  -- the file must exist and be fresh (stops re-submitting old uploads)
  IF NOT EXISTS (SELECT 1 FROM storage.objects
                 WHERE bucket_id = 'panzutti-family' AND name = p_file_path
                   AND created_at > now() - interval '1 hour') THEN
    RAISE EXCEPTION 'Upload the photo first';
  END IF;
  IF (SELECT count(*) FROM public.family_photos
      WHERE status = 'pending' AND file_path LIKE 'guest/%') >= 100 THEN
    RAISE EXCEPTION 'We have a lot of photos to review right now — please try again later';
  END IF;

  INSERT INTO public.family_photos (file_path, caption, uploaded_by, uploader_name, status)
  VALUES (p_file_path, NULLIF(trim(p_caption), ''), auth.uid(),
          split_part(v_name, ' ', 1), 'pending')
  RETURNING id INTO v_id;

  SELECT * INTO v_set FROM public.app_settings WHERE id;
  PERFORM public.queue_email('family_photo_admin', v_set.gallery_email,
    jsonb_build_object('uploader_name', v_name, 'uploader_email', NULL,
                       'caption', NULLIF(trim(p_caption), ''), 'photo_id', v_id), 'en');
  RETURN v_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.guest_family_upload_allowed() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.guest_family_upload_allowed() TO anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.submit_guest_family_photo(text, text, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.submit_guest_family_photo(text, text, text) TO anon, authenticated;
