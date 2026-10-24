-- =====================================================================
--  PANZUTTI — Supabase script, PART 2 (v2 additions)
--  Run AFTER panzutti_supabase.sql.
--
--  Adds:
--   A. Google sign-in profile fields (avatar)
--   B. Payment method: cash on delivery or InstaPay, with transfer
--      screenshots (payment_proofs + private storage bucket) reviewed by staff
--   C. Checkout suggestions ("add a drink?")
--   D. Panzutti Family gallery: customers upload photos, admin approves
--   E. Join our team / service providers: applications with CV/catalog
--   F. Email queue sent through Gmail SMTP by the Edge Function "send-emails"
--      (delivery orders, InstaPay proofs, applications, gallery uploads)
--
--  ONE-TIME SETUP AFTER RUNNING (see section F at the bottom):
--   * Store the Edge Function URL and project anon key in Vault
--   * Set Gmail secrets on the Edge Function (GMAIL_USER, GMAIL_APP_PASSWORD)
--   * Put your notification email addresses in public.app_settings
-- =====================================================================


-- =====================================================================
-- A. GOOGLE SIGN-IN — keep the Google profile picture
-- =====================================================================
ALTER TABLE public.profiles ADD COLUMN avatar_url text;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_phone  text := public.normalize_phone(COALESCE(NEW.phone, NEW.raw_user_meta_data ->> 'phone'));
  v_name   text := COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.raw_user_meta_data ->> 'name', '');
  v_avatar text := COALESCE(NEW.raw_user_meta_data ->> 'avatar_url', NEW.raw_user_meta_data ->> 'picture');
BEGIN
  BEGIN
    INSERT INTO public.profiles (id, full_name, phone, email, avatar_url)
    VALUES (NEW.id, v_name, v_phone, NEW.email, v_avatar)
    ON CONFLICT (id) DO NOTHING;
  EXCEPTION WHEN unique_violation THEN
    INSERT INTO public.profiles (id, full_name, phone, email, avatar_url)
    VALUES (NEW.id, v_name, NULL, NEW.email, v_avatar)
    ON CONFLICT (id) DO NOTHING;
  END;
  RETURN NEW;
END;
$$;

-- Indexes the Supabase performance advisor asked for
CREATE INDEX IF NOT EXISTS profiles_branch_idx    ON public.profiles (branch_id) WHERE branch_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS promo_codes_branch_idx ON public.promo_codes (branch_id) WHERE branch_id IS NOT NULL;


-- =====================================================================
-- SETTINGS (one row) — where notification emails go
-- =====================================================================
CREATE TABLE public.app_settings (
  id                    boolean PRIMARY KEY DEFAULT true CHECK (id),   -- only one row
  orders_email          text,      -- new delivery orders, InstaPay screenshots
  hr_email              text,      -- job applications
  suppliers_email       text,      -- service provider applications
  gallery_email         text,      -- new Panzutti Family photos waiting for approval
  email_from_name       text NOT NULL DEFAULT 'Panzutti',
  email_pickup_orders   boolean NOT NULL DEFAULT false,   -- also email for pickup orders
  updated_at            timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER app_settings_updated_at BEFORE UPDATE ON public.app_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- =====================================================================
-- F1. EMAIL QUEUE (filled by the database, emptied by the Edge Function)
-- =====================================================================
CREATE TABLE public.email_outbox (
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  kind             text NOT NULL,          -- template name, see send-emails function
  recipient        text NOT NULL,
  locale           text NOT NULL DEFAULT 'en' CHECK (locale IN ('en', 'ar')),
  payload          jsonb NOT NULL DEFAULT '{}'::jsonb,
  status           text NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending', 'sending', 'sent', 'failed')),
  attempts         smallint NOT NULL DEFAULT 0,
  last_error       text,
  last_attempt_at  timestamptz,
  sent_at          timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX email_outbox_todo_idx ON public.email_outbox (status, created_at)
  WHERE status IN ('pending', 'sending', 'failed');

CREATE OR REPLACE FUNCTION public.is_valid_email(p text)
RETURNS boolean
LANGUAGE sql IMMUTABLE
SET search_path = public, pg_temp
AS $$ SELECT p ~* '^[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}$' $$;

-- Add one email to the queue (skips silently if the address is missing/invalid)
CREATE OR REPLACE FUNCTION public.queue_email(p_kind text, p_recipient text, p_payload jsonb, p_locale text DEFAULT 'en')
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_recipient IS NULL OR NOT public.is_valid_email(trim(p_recipient)) THEN
    RETURN;
  END IF;
  INSERT INTO public.email_outbox (kind, recipient, payload, locale)
  VALUES (p_kind, lower(trim(p_recipient)), COALESCE(p_payload, '{}'::jsonb),
          CASE WHEN p_locale = 'ar' THEN 'ar' ELSE 'en' END);
END;
$$;

-- Wake the Edge Function. Needs two Vault secrets (see setup at the bottom):
--   panzutti_email_function_url, panzutti_email_function_key
-- Never raises: an email problem must not block an order.
CREATE OR REPLACE FUNCTION public.dispatch_email_outbox()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_url text;
  v_key text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.email_outbox
                 WHERE status = 'pending'
                    OR (status = 'failed'  AND attempts < 5 AND last_attempt_at < now() - interval '4 minutes')
                    OR (status = 'sending' AND last_attempt_at < now() - interval '10 minutes')) THEN
    RETURN;
  END IF;

  SELECT decrypted_secret INTO v_url FROM vault.decrypted_secrets WHERE name = 'panzutti_email_function_url';
  SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets WHERE name = 'panzutti_email_function_key';
  IF v_url IS NULL OR v_key IS NULL THEN
    RETURN;   -- not configured yet; emails stay queued
  END IF;

  PERFORM net.http_post(
    url     := v_url,
    body    := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json',
                                  'Authorization', 'Bearer ' || v_key),
    timeout_milliseconds := 10000
  );
EXCEPTION WHEN others THEN
  RAISE WARNING 'dispatch_email_outbox: %', SQLERRM;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_dispatch_email_outbox()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public.dispatch_email_outbox();
  RETURN NULL;
END;
$$;

CREATE TRIGGER email_outbox_dispatch
  AFTER INSERT ON public.email_outbox
  FOR EACH STATEMENT EXECUTE FUNCTION public.trg_dispatch_email_outbox();

-- Used by the Edge Function (service role only): take up to N emails to send
CREATE OR REPLACE FUNCTION public.claim_email_batch(p_limit integer DEFAULT 20)
RETURNS SETOF public.email_outbox
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN QUERY
  UPDATE public.email_outbox e
  SET status = 'sending', attempts = e.attempts + 1, last_attempt_at = now()
  WHERE e.id IN (
    SELECT id FROM public.email_outbox
    WHERE status = 'pending'
       OR (status = 'failed'  AND attempts < 5 AND last_attempt_at < now() - interval '4 minutes')
       OR (status = 'sending' AND last_attempt_at < now() - interval '10 minutes')
    ORDER BY created_at
    LIMIT GREATEST(LEAST(p_limit, 50), 1)
    FOR UPDATE SKIP LOCKED
  )
  RETURNING e.*;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_email(p_id bigint, p_error text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.email_outbox
  SET status     = CASE WHEN p_error IS NULL THEN 'sent' ELSE 'failed' END,
      sent_at    = CASE WHEN p_error IS NULL THEN now() END,
      last_error = left(p_error, 1000)
  WHERE id = p_id;
END;
$$;


-- =====================================================================
-- B. PAYMENT: CASH ON DELIVERY OR INSTAPAY
-- =====================================================================
CREATE TYPE public.payment_method AS ENUM ('cash', 'instapay');
CREATE TYPE public.review_status  AS ENUM ('pending', 'approved', 'rejected');

ALTER TABLE public.branches
  ADD COLUMN accepts_instapay  boolean NOT NULL DEFAULT true,
  ADD COLUMN instapay_address  text;          -- e.g. 'panzutti@instapay' or the InstaPay phone

ALTER TABLE public.orders
  ADD COLUMN payment_method  public.payment_method NOT NULL DEFAULT 'cash',
  ADD COLUMN customer_email  text CHECK (customer_email IS NULL OR public.is_valid_email(customer_email));
CREATE INDEX orders_payment_idx ON public.orders (payment_method, payment_status)
  WHERE payment_method = 'instapay' AND payment_status = 'unpaid';

-- One row per uploaded InstaPay screenshot
CREATE TABLE public.payment_proofs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id      uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  file_path     text NOT NULL,                 -- object name in the 'payment-proofs' bucket
  reference     text,                          -- InstaPay reference number, if the customer gives it
  status        public.review_status NOT NULL DEFAULT 'pending',
  reviewed_by   uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at   timestamptz,
  review_note   text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX payment_proofs_order_idx    ON public.payment_proofs (order_id, created_at DESC);
CREATE INDEX payment_proofs_reviewer_idx ON public.payment_proofs (reviewed_by);
CREATE UNIQUE INDEX payment_proofs_one_pending ON public.payment_proofs (order_id) WHERE status = 'pending';

-- Who may upload a screenshot for an order (used by the storage policy):
-- the order must exist, be InstaPay, unpaid, not cancelled, and < 3 days old.
-- File path must be '<order_id>/<file name>'.
CREATE OR REPLACE FUNCTION public.can_upload_payment_proof(p_object_name text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id::text = split_part(p_object_name, '/', 1)
      AND o.payment_method = 'instapay'
      AND o.payment_status = 'unpaid'
      AND o.status <> 'cancelled'
      AND o.created_at > now() - interval '3 days'
  );
$$;


-- =====================================================================
-- C. CHECKOUT SUGGESTIONS
-- =====================================================================
ALTER TABLE public.menu_items ADD COLUMN suggest_at_checkout boolean NOT NULL DEFAULT false;
CREATE INDEX menu_items_suggest_idx ON public.menu_items (sort_order) WHERE suggest_at_checkout AND is_active;

-- Items to offer on the checkout page.
--   * Items the admin flagged with suggest_at_checkout
--   * Never something already in the cart, sold out or hidden
--   * Items from categories NOT already in the cart come first
--     (cart has food -> suggest drinks and desserts)
--   * If nothing is flagged, falls back to the best sellers of the last 30 days
CREATE OR REPLACE FUNCTION public.get_checkout_suggestions(
  p_cart_item_ids uuid[]  DEFAULT '{}',
  p_limit         integer DEFAULT 6
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_limit     integer := GREATEST(LEAST(COALESCE(p_limit, 6), 20), 1);
  v_cart      uuid[]  := COALESCE(p_cart_item_ids, '{}');
  v_cart_cats uuid[];
  v_result    jsonb;
BEGIN
  SELECT COALESCE(array_agg(DISTINCT category_id), '{}') INTO v_cart_cats
  FROM public.menu_items WHERE id = ANY (v_cart);

  WITH candidates AS (
    SELECT i.*, 0 AS popularity
    FROM public.menu_items i
    JOIN public.menu_categories c ON c.id = i.category_id AND c.is_active
    WHERE i.suggest_at_checkout AND i.is_active AND NOT i.is_sold_out
      AND NOT (i.id = ANY (v_cart))
  ), fallback AS (
    SELECT i.*, sum(oi.quantity)::integer AS popularity
    FROM public.order_items oi
    JOIN public.orders o ON o.id = oi.order_id
         AND o.status = 'completed' AND o.created_at > now() - interval '30 days'
    JOIN public.menu_items i ON i.id = oi.menu_item_id
    JOIN public.menu_categories c ON c.id = i.category_id AND c.is_active
    WHERE i.is_active AND NOT i.is_sold_out AND NOT (i.id = ANY (v_cart))
      AND NOT EXISTS (SELECT 1 FROM candidates)
    GROUP BY i.id
  ), pool AS (
    SELECT * FROM candidates UNION ALL SELECT * FROM fallback
  ), picked AS (
    SELECT p.*
    FROM pool p
    ORDER BY (p.category_id = ANY (v_cart_cats)), p.popularity DESC, p.is_signature DESC, p.sort_order, p.name_en
    LIMIT v_limit
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', p.id, 'slug', p.slug, 'name_en', p.name_en, 'name_ar', p.name_ar,
           'price', p.price, 'image_url', p.image_url, 'is_signature', p.is_signature,
           'category_id', p.category_id,
           -- true = open the item page first (customer must pick a side, etc.)
           'has_required_choices', EXISTS (
              SELECT 1 FROM public.menu_item_addon_groups mg
              JOIN public.addon_groups g ON g.id = mg.group_id
              WHERE mg.menu_item_id = p.id AND g.min_select > 0)
         )), '[]'::jsonb)
  INTO v_result
  FROM picked p;

  RETURN v_result;
END;
$$;


-- =====================================================================
-- D. PANZUTTI FAMILY GALLERY (customer photos, admin approval)
--    Storage bucket 'panzutti-family' is private:
--      * anyone can view APPROVED photos
--      * logged-in customers upload into '<their user id>/...'
--      * customers see their own uploads; admins see everything
--    The website shows photos with storage.createSignedUrls(paths, 3600)
--    using the file_path values returned by get_family_gallery().
-- =====================================================================
CREATE TABLE public.family_photos (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  file_path      text NOT NULL UNIQUE,      -- object name in the 'panzutti-family' bucket
  caption        text CHECK (caption IS NULL OR length(caption) <= 300),
  uploaded_by    uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  uploader_name  text,                      -- shown under the photo
  is_official    boolean NOT NULL DEFAULT false,   -- posted by the restaurant
  status         public.review_status NOT NULL DEFAULT 'pending',
  reviewed_by    uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at    timestamptz,
  review_note    text,
  sort_order     integer NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX family_photos_public_idx   ON public.family_photos (status, sort_order, reviewed_at DESC);
CREATE INDEX family_photos_uploader_idx ON public.family_photos (uploaded_by, created_at DESC);
CREATE INDEX family_photos_reviewer_idx ON public.family_photos (reviewed_by);

-- Storage read rule for the gallery bucket
CREATE OR REPLACE FUNCTION public.can_view_family_photo(p_object_name text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.is_admin()
      OR split_part(p_object_name, '/', 1) = COALESCE(auth.uid()::text, '-')
      OR EXISTS (SELECT 1 FROM public.family_photos f
                 WHERE f.file_path = p_object_name AND f.status = 'approved');
$$;


-- =====================================================================
-- E. JOIN OUR TEAM / SERVICE PROVIDERS
--    Storage bucket 'applications' is private. Anyone may upload a CV or
--    catalog into 'incoming/<random id>/<file>'; only admins can read.
-- =====================================================================
CREATE TYPE public.application_type   AS ENUM ('job', 'service_provider');
CREATE TYPE public.application_status AS ENUM ('new', 'reviewing', 'contacted', 'accepted', 'rejected');

CREATE TABLE public.job_positions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title_en        text NOT NULL,
  title_ar        text NOT NULL,
  description_en  text,
  description_ar  text,
  branch_id       uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  is_open         boolean NOT NULL DEFAULT true,
  sort_order      integer NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX job_positions_branch_idx ON public.job_positions (branch_id);
CREATE TRIGGER job_positions_updated_at BEFORE UPDATE ON public.job_positions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.service_categories (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        text NOT NULL UNIQUE,
  name_en     text NOT NULL,
  name_ar     text NOT NULL,
  is_active   boolean NOT NULL DEFAULT true,
  sort_order  integer NOT NULL DEFAULT 0
);

CREATE TABLE public.applications (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type                 public.application_type NOT NULL,
  full_name            text NOT NULL,
  phone                text NOT NULL CHECK (phone ~ '^\+[0-9]{8,15}$'),
  email                text NOT NULL CHECK (public.is_valid_email(email)),
  job_position_id      uuid REFERENCES public.job_positions(id) ON DELETE SET NULL,
  position_other       text,                -- "Other" position typed by the applicant
  service_category_id  uuid REFERENCES public.service_categories(id) ON DELETE SET NULL,
  company_name         text,
  message              text CHECK (message IS NULL OR length(message) <= 3000),
  attachment_path      text,                -- CV or catalog, in the 'applications' bucket
  locale               text NOT NULL DEFAULT 'en' CHECK (locale IN ('en', 'ar')),
  status               public.application_status NOT NULL DEFAULT 'new',
  staff_note           text,
  reviewed_by          uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  user_id              uuid REFERENCES public.profiles(id) ON DELETE SET NULL,   -- if logged in
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX applications_list_idx      ON public.applications (type, status, created_at DESC);
CREATE INDEX applications_phone_idx     ON public.applications (phone, created_at DESC);
CREATE INDEX applications_position_idx  ON public.applications (job_position_id);
CREATE INDEX applications_category_idx  ON public.applications (service_category_id);
CREATE INDEX applications_reviewer_idx  ON public.applications (reviewed_by);
CREATE INDEX applications_user_idx      ON public.applications (user_id);
CREATE TRIGGER applications_updated_at BEFORE UPDATE ON public.applications
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- =====================================================================
-- B2. ORDER FUNCTIONS — updated for payment method + emails
-- =====================================================================

-- Emails for a newly placed order (delivery orders; pickup too if enabled)
CREATE OR REPLACE FUNCTION public.queue_order_emails(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v        public.orders%ROWTYPE;
  v_set    public.app_settings%ROWTYPE;
  v_branch public.branches%ROWTYPE;
  v_data   jsonb;
BEGIN
  SELECT * INTO v FROM public.orders WHERE id = p_order_id;
  SELECT * INTO v_set FROM public.app_settings WHERE id;
  IF v.type = 'pickup' AND NOT COALESCE(v_set.email_pickup_orders, false) THEN
    RETURN;
  END IF;
  SELECT * INTO v_branch FROM public.branches WHERE id = v.branch_id;

  v_data := jsonb_build_object(
    'order_id', v.id, 'order_number', v.order_number, 'type', v.type,
    'customer_name', v.customer_name, 'customer_phone', v.customer_phone,
    'customer_email', v.customer_email,
    'delivery_address', v.delivery_address, 'delivery_notes', v.delivery_notes,
    'note', v.note, 'scheduled_for', v.scheduled_for,
    'payment_method', v.payment_method, 'instapay_address', v_branch.instapay_address,
    'subtotal', v.subtotal, 'discount_total', v.discount_total, 'promo_code', v.promo_code,
    'delivery_fee', v.delivery_fee, 'total', v.total, 'created_at', v.created_at,
    'branch_name', CASE WHEN v.locale = 'ar' THEN v_branch.name_ar ELSE v_branch.name_en END,
    'branch_phone', v_branch.phone,
    'items', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
                'name', oi.item_name, 'quantity', oi.quantity, 'line_total', oi.line_total,
                'note', oi.note,
                'addons', (SELECT COALESCE(jsonb_agg(oia.addon_name ||
                             CASE WHEN oia.quantity > 1 THEN ' ×' || oia.quantity ELSE '' END), '[]'::jsonb)
                           FROM public.order_item_addons oia WHERE oia.order_item_id = oi.id))
              ), '[]'::jsonb)
              FROM public.order_items oi WHERE oi.order_id = v.id)
  );

  PERFORM public.queue_email('order_new_restaurant', v_set.orders_email, v_data, 'en');
  PERFORM public.queue_email('order_confirmation_customer', v.customer_email, v_data, v.locale);
END;
$$;

-- place_order gains p_payment_method and p_customer_email (added at the end)
-- The old 14-parameter version is renamed (not dropped) and switched off,
-- so the API only sees the new one. Safe to drop later:
--   drop function public.place_order_v1(uuid, public.order_type, text, text, jsonb, text, text, text, timestamptz, text, text, uuid, boolean, text);
ALTER FUNCTION public.place_order(uuid, public.order_type, text, text, jsonb, text, text, text,
                                  timestamptz, text, text, uuid, boolean, text) RENAME TO place_order_v1;
REVOKE EXECUTE ON FUNCTION public.place_order_v1(uuid, public.order_type, text, text, jsonb, text, text, text,
                                  timestamptz, text, text, uuid, boolean, text) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.place_order(
  p_branch_id         uuid,
  p_type              public.order_type,
  p_customer_name     text,
  p_customer_phone    text,
  p_items             jsonb,
  p_delivery_address  text        DEFAULT NULL,
  p_delivery_notes    text        DEFAULT NULL,
  p_note              text        DEFAULT NULL,
  p_scheduled_for     timestamptz DEFAULT NULL,
  p_promo_code        text        DEFAULT NULL,
  p_locale            text        DEFAULT 'en',
  p_address_id        uuid        DEFAULT NULL,
  p_save_address      boolean     DEFAULT false,
  p_address_label     text        DEFAULT NULL,
  p_payment_method    public.payment_method DEFAULT 'cash',
  p_customer_email    text        DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_branch      public.branches%ROWTYPE;
  v_saved       public.customer_addresses%ROWTYPE;
  v_address     text := NULLIF(trim(p_delivery_address), '');
  v_addr_notes  text := NULLIF(trim(p_delivery_notes), '');
  v_address_id  uuid;
  v_item        public.menu_items%ROWTYPE;
  v_addon       public.addons%ROWTYPE;
  v_group       public.addon_groups%ROWTYPE;
  v_phone       text := public.normalize_phone(p_customer_phone);
  v_email       text := NULLIF(lower(trim(p_customer_email)), '');
  v_locale      text := CASE WHEN p_locale = 'ar' THEN 'ar' ELSE 'en' END;
  v_method      public.payment_method := COALESCE(p_payment_method, 'cash');
  v_user        uuid;
  v_order_id    uuid;
  v_order_item  uuid;
  v_line        jsonb;
  v_sel         jsonb;
  v_qty         integer;
  v_aqty        integer;
  v_count       integer;
  v_subtotal    integer;
  v_promo       record;
  v_result      jsonb;
BEGIN
  IF COALESCE(trim(p_customer_name), '') = '' THEN
    RAISE EXCEPTION 'Please enter your name';
  END IF;
  IF v_phone IS NULL THEN
    RAISE EXCEPTION 'Please enter a valid phone number';
  END IF;
  IF v_email IS NOT NULL AND NOT public.is_valid_email(v_email) THEN
    RAISE EXCEPTION 'Please enter a valid email address';
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Your cart is empty';
  END IF;
  IF jsonb_array_length(p_items) > 50 THEN
    RAISE EXCEPTION 'Too many items in one order';
  END IF;

  SELECT * INTO v_branch FROM public.branches WHERE id = p_branch_id AND is_active;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Branch not found';
  END IF;
  IF p_type = 'pickup' AND NOT v_branch.accepts_pickup THEN
    RAISE EXCEPTION 'This branch is not taking pickup orders right now';
  END IF;
  IF p_type = 'delivery' AND NOT v_branch.accepts_delivery THEN
    RAISE EXCEPTION 'This branch is not taking delivery orders right now';
  END IF;
  IF v_method = 'instapay' AND (NOT v_branch.accepts_instapay OR v_branch.instapay_address IS NULL) THEN
    RAISE EXCEPTION 'InstaPay is not available at this branch right now';
  END IF;

  IF p_type = 'delivery' AND p_address_id IS NOT NULL THEN
    SELECT * INTO v_saved FROM public.customer_addresses
    WHERE id = p_address_id AND user_id = auth.uid();
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Saved address not found';
    END IF;
    v_address    := v_saved.address || COALESCE(', ' || NULLIF(trim(v_saved.area), ''), '');
    v_addr_notes := COALESCE(v_addr_notes, v_saved.notes);
    v_address_id := v_saved.id;
    UPDATE public.customer_addresses SET last_used_at = now() WHERE id = v_saved.id;
  END IF;
  IF p_type = 'delivery' AND v_address IS NULL THEN
    RAISE EXCEPTION 'Please enter a delivery address';
  END IF;
  IF p_type = 'delivery' AND p_address_id IS NULL AND p_save_address THEN
    IF auth.uid() IS NULL THEN
      RAISE EXCEPTION 'Log in to save addresses';
    END IF;
    INSERT INTO public.customer_addresses (user_id, label, address, notes, last_used_at)
    VALUES (auth.uid(), COALESCE(NULLIF(trim(p_address_label), ''), 'Home'), v_address, v_addr_notes, now())
    RETURNING id INTO v_address_id;
  END IF;
  IF p_scheduled_for IS NOT NULL
     AND (p_scheduled_for < now() + interval '15 minutes'
          OR p_scheduled_for > now() + interval '7 days') THEN
    RAISE EXCEPTION 'Scheduled time must be between 15 minutes and 7 days from now';
  END IF;
  IF NOT public.is_branch_open(p_branch_id, COALESCE(p_scheduled_for, now())) THEN
    RAISE EXCEPTION 'The branch is closed at that time (open % – %)',
      to_char(v_branch.opens_at, 'HH12:MI AM'), to_char(v_branch.closes_at, 'HH12:MI AM');
  END IF;

  -- logged-in customer (null for guests); Google accounts give us an email
  SELECT id, COALESCE(v_email, email) INTO v_user, v_email FROM public.profiles WHERE id = auth.uid();
  IF v_user IS NULL THEN
    v_email := NULLIF(lower(trim(p_customer_email)), '');
  END IF;

  INSERT INTO public.orders (branch_id, user_id, type, customer_name, customer_phone, customer_email,
                             delivery_address, delivery_notes, customer_address_id,
                             scheduled_for, note, delivery_fee, locale, payment_method)
  VALUES (p_branch_id, v_user, p_type, trim(p_customer_name), v_phone, v_email,
          CASE WHEN p_type = 'delivery' THEN v_address END,
          CASE WHEN p_type = 'delivery' THEN v_addr_notes END,
          CASE WHEN p_type = 'delivery' THEN v_address_id END,
          p_scheduled_for, NULLIF(trim(p_note), ''),
          CASE WHEN p_type = 'delivery' THEN v_branch.delivery_fee ELSE 0 END,
          v_locale, v_method)
  RETURNING id INTO v_order_id;

  FOR v_line IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    v_qty := COALESCE((v_line ->> 'quantity')::integer, 1);
    IF v_qty < 1 OR v_qty > 50 THEN
      RAISE EXCEPTION 'Quantity must be between 1 and 50';
    END IF;

    SELECT mi.* INTO v_item
    FROM public.menu_items mi
    JOIN public.menu_categories c ON c.id = mi.category_id
    WHERE mi.id = (v_line ->> 'menu_item_id')::uuid AND mi.is_active AND c.is_active;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'An item in your cart is no longer on the menu';
    END IF;
    IF v_item.is_sold_out THEN
      RAISE EXCEPTION '% is sold out', v_item.name_en;
    END IF;

    INSERT INTO public.order_items (order_id, menu_item_id, item_name, unit_price, quantity, note)
    VALUES (v_order_id, v_item.id,
            CASE WHEN v_locale = 'ar' THEN v_item.name_ar ELSE v_item.name_en END,
            v_item.price, v_qty, NULLIF(trim(v_line ->> 'note'), ''))
    RETURNING id INTO v_order_item;

    IF v_line ? 'addons' AND jsonb_typeof(v_line -> 'addons') <> 'array' THEN
      RAISE EXCEPTION 'Invalid add-ons for %', v_item.name_en;
    END IF;

    FOR v_sel IN SELECT value FROM jsonb_array_elements(COALESCE(v_line -> 'addons', '[]'::jsonb)) LOOP
      v_aqty := COALESCE((v_sel ->> 'quantity')::integer, 1);

      SELECT a.* INTO v_addon
      FROM public.addons a
      JOIN public.menu_item_addon_groups mg
        ON mg.group_id = a.group_id AND mg.menu_item_id = v_item.id
      WHERE a.id = (v_sel ->> 'addon_id')::uuid AND a.is_active;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'One of the add-ons is not available for %', v_item.name_en;
      END IF;
      IF v_addon.is_sold_out THEN
        RAISE EXCEPTION '% is sold out', v_addon.name_en;
      END IF;
      IF v_aqty < 1 OR v_aqty > v_addon.max_quantity THEN
        RAISE EXCEPTION 'You can add at most % × %', v_addon.max_quantity, v_addon.name_en;
      END IF;

      SELECT * INTO v_group FROM public.addon_groups WHERE id = v_addon.group_id;

      BEGIN
        INSERT INTO public.order_item_addons
          (order_item_id, addon_id, group_id, group_name, addon_name, unit_price, quantity)
        VALUES (v_order_item, v_addon.id, v_group.id,
                CASE WHEN v_locale = 'ar' THEN v_group.name_ar ELSE v_group.name_en END,
                CASE WHEN v_locale = 'ar' THEN v_addon.name_ar ELSE v_addon.name_en END,
                v_addon.price, v_aqty);
      EXCEPTION WHEN unique_violation THEN
        RAISE EXCEPTION '% was added twice to %', v_addon.name_en, v_item.name_en;
      END;
    END LOOP;

    FOR v_group IN
      SELECT g.* FROM public.addon_groups g
      JOIN public.menu_item_addon_groups mg ON mg.group_id = g.id
      WHERE mg.menu_item_id = v_item.id
    LOOP
      SELECT count(*) INTO v_count
      FROM public.order_item_addons
      WHERE order_item_id = v_order_item AND group_id = v_group.id;

      IF v_count < v_group.min_select THEN
        RAISE EXCEPTION '%: please choose % (at least %)', v_item.name_en, v_group.name_en, v_group.min_select;
      END IF;
      IF v_count > v_group.max_select THEN
        RAISE EXCEPTION '%: you can choose at most % for %', v_item.name_en, v_group.max_select, v_group.name_en;
      END IF;
    END LOOP;
  END LOOP;

  SELECT subtotal INTO v_subtotal FROM public.orders WHERE id = v_order_id;

  IF p_type = 'delivery' AND v_subtotal < v_branch.min_delivery_order THEN
    RAISE EXCEPTION 'The minimum order for delivery is % EGP',
      to_char(v_branch.min_delivery_order / 100.0, 'FM999999990.00');
  END IF;

  IF NULLIF(trim(p_promo_code), '') IS NOT NULL THEN
    SELECT * INTO v_promo
    FROM public.validate_promo_code(p_promo_code, p_branch_id, p_type, v_subtotal, v_phone);

    UPDATE public.orders
    SET promo_code_id = v_promo.promo_id,
        promo_code     = v_promo.promo_code,
        discount_total = v_promo.discount_amount
    WHERE id = v_order_id;
  END IF;

  PERFORM public.queue_order_emails(v_order_id);

  SELECT jsonb_build_object(
           'order_id', o.id, 'order_number', o.order_number, 'status', o.status,
           'payment_method', o.payment_method,
           'instapay_address', CASE WHEN o.payment_method = 'instapay' THEN v_branch.instapay_address END,
           'subtotal', o.subtotal, 'discount_total', o.discount_total,
           'delivery_fee', o.delivery_fee, 'total', o.total)
  INTO v_result
  FROM public.orders o WHERE o.id = v_order_id;

  RETURN v_result;
END;
$$;

-- update_order_status: completing a CASH order marks it paid; an InstaPay
-- order must already be paid (transfer approved) before it can be completed.
CREATE OR REPLACE FUNCTION public.update_order_status(
  p_order_id  uuid,
  p_status    public.order_status,
  p_reason    text DEFAULT NULL
)
RETURNS public.orders
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v          public.orders%ROWTYPE;
  v_staff    boolean;
  v_allowed  boolean;
BEGIN
  SELECT * INTO v FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  v_staff := public.is_staff() AND public.can_access_branch(v.branch_id);

  IF NOT v_staff THEN
    IF auth.uid() IS NULL OR v.user_id IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'You are not allowed to change this order';
    END IF;
    IF p_status <> 'cancelled' OR v.status <> 'pending' THEN
      RAISE EXCEPTION 'You can only cancel your order before the restaurant confirms it';
    END IF;
  END IF;

  v_allowed := CASE v.status
    WHEN 'pending'          THEN p_status IN ('confirmed', 'cancelled')
    WHEN 'confirmed'        THEN p_status IN ('preparing', 'cancelled')
    WHEN 'preparing'        THEN p_status IN ('ready', 'cancelled')
    WHEN 'ready'            THEN p_status = 'cancelled'
                              OR (v.type = 'pickup'   AND p_status = 'completed')
                              OR (v.type = 'delivery' AND p_status = 'out_for_delivery')
    WHEN 'out_for_delivery' THEN p_status IN ('completed', 'cancelled')
    ELSE false
  END;
  IF NOT v_allowed THEN
    RAISE EXCEPTION 'An order cannot go from % to %', v.status, p_status;
  END IF;

  IF p_status = 'completed' AND v.payment_method = 'instapay' AND v.payment_status <> 'paid' THEN
    RAISE EXCEPTION 'Approve the InstaPay transfer (or mark the order paid) before completing it';
  END IF;

  IF p_status = 'cancelled' AND v_staff AND COALESCE(trim(p_reason), '') = '' THEN
    RAISE EXCEPTION 'Please give a reason for cancelling';
  END IF;

  UPDATE public.orders
  SET status         = p_status,
      cancel_reason  = CASE WHEN p_status = 'cancelled'
                            THEN COALESCE(NULLIF(trim(p_reason), ''), 'Cancelled by customer')
                            ELSE cancel_reason END,
      payment_status = CASE WHEN p_status = 'completed' THEN 'paid' ELSE payment_status END,
      paid_at        = CASE WHEN p_status = 'completed' AND paid_at IS NULL THEN now() ELSE paid_at END,
      handled_by     = CASE WHEN v_staff THEN auth.uid() ELSE handled_by END
  WHERE id = p_order_id
  RETURNING * INTO v;

  RETURN v;
END;
$$;

-- InstaPay step 2: after uploading the screenshot to
--   storage bucket 'payment-proofs', path '<order_id>/<any file name>'
-- the website calls this to attach it to the order.
-- Works for guests: they prove it is their order with the phone number.
CREATE OR REPLACE FUNCTION public.submit_payment_proof(
  p_order_id   uuid,
  p_phone      text,
  p_file_path  text,
  p_reference  text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v        public.orders%ROWTYPE;
  v_set    public.app_settings%ROWTYPE;
  v_id     uuid;
BEGIN
  SELECT * INTO v FROM public.orders
  WHERE id = p_order_id AND customer_phone = public.normalize_phone(p_phone)
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;
  IF v.payment_method <> 'instapay' THEN
    RAISE EXCEPTION 'This order is not paid by InstaPay';
  END IF;
  IF v.payment_status = 'paid' THEN
    RAISE EXCEPTION 'This order is already paid';
  END IF;
  IF v.status = 'cancelled' THEN
    RAISE EXCEPTION 'This order was cancelled';
  END IF;
  IF split_part(p_file_path, '/', 1) <> p_order_id::text
     OR NOT EXISTS (SELECT 1 FROM storage.objects
                    WHERE bucket_id = 'payment-proofs' AND name = p_file_path) THEN
    RAISE EXCEPTION 'Upload the screenshot first';
  END IF;
  IF (SELECT count(*) FROM public.payment_proofs WHERE order_id = p_order_id) >= 5 THEN
    RAISE EXCEPTION 'Too many uploads for this order — please call the restaurant';
  END IF;

  -- a newer screenshot replaces one still waiting for review
  UPDATE public.payment_proofs
  SET status = 'rejected', review_note = 'Replaced by a newer upload', reviewed_at = now()
  WHERE order_id = p_order_id AND status = 'pending';

  INSERT INTO public.payment_proofs (order_id, file_path, reference)
  VALUES (p_order_id, p_file_path, NULLIF(trim(p_reference), ''))
  RETURNING id INTO v_id;

  SELECT * INTO v_set FROM public.app_settings WHERE id;
  PERFORM public.queue_email('payment_proof_restaurant', v_set.orders_email,
    jsonb_build_object('order_number', v.order_number, 'customer_name', v.customer_name,
                       'customer_phone', v.customer_phone, 'total', v.total,
                       'reference', NULLIF(trim(p_reference), '')), 'en');
  RETURN v_id;
END;
$$;

-- Staff approve or reject a screenshot. Approving marks the order paid.
CREATE OR REPLACE FUNCTION public.review_payment_proof(
  p_proof_id  uuid,
  p_approve   boolean,
  p_note      text DEFAULT NULL
)
RETURNS public.payment_proofs
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_proof  public.payment_proofs%ROWTYPE;
  v_order  public.orders%ROWTYPE;
BEGIN
  SELECT * INTO v_proof FROM public.payment_proofs WHERE id = p_proof_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment proof not found';
  END IF;
  SELECT * INTO v_order FROM public.orders WHERE id = v_proof.order_id FOR UPDATE;
  IF NOT (public.is_staff() AND public.can_access_branch(v_order.branch_id)) THEN
    RAISE EXCEPTION 'Only staff can review payments';
  END IF;
  IF v_proof.status <> 'pending' THEN
    RAISE EXCEPTION 'This screenshot was already reviewed';
  END IF;
  IF NOT p_approve AND COALESCE(trim(p_note), '') = '' THEN
    RAISE EXCEPTION 'Please give a reason for rejecting';
  END IF;

  UPDATE public.payment_proofs
  SET status = CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END::public.review_status,
      reviewed_by = auth.uid(), reviewed_at = now(), review_note = NULLIF(trim(p_note), '')
  WHERE id = p_proof_id
  RETURNING * INTO v_proof;

  IF p_approve THEN
    UPDATE public.orders
    SET payment_status = 'paid', paid_at = COALESCE(paid_at, now()), handled_by = auth.uid()
    WHERE id = v_order.id;
  ELSE
    PERFORM public.queue_email('payment_rejected_customer', v_order.customer_email,
      jsonb_build_object('order_number', v_order.order_number, 'order_id', v_order.id,
                         'total', v_order.total, 'reason', trim(p_note),
                         'branch_phone', (SELECT phone FROM public.branches WHERE id = v_order.branch_id)),
      v_order.locale);
  END IF;

  RETURN v_proof;
END;
$$;

-- track_order now also returns payment method and InstaPay status
CREATE OR REPLACE FUNCTION public.track_order(p_order_number bigint, p_phone text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v       public.orders%ROWTYPE;
  v_json  jsonb;
BEGIN
  SELECT * INTO v FROM public.orders
  WHERE order_number = p_order_number
    AND customer_phone = public.normalize_phone(p_phone);
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No order found with that number and phone';
  END IF;

  SELECT jsonb_build_object(
    'order_id',       v.id,
    'order_number',   v.order_number,
    'status',         v.status,
    'type',           v.type,
    'payment_method', v.payment_method,
    'payment_status', v.payment_status,
    'instapay_address', CASE WHEN v.payment_method = 'instapay'
                             THEN (SELECT instapay_address FROM public.branches WHERE id = v.branch_id) END,
    'payment_proof',  (SELECT jsonb_build_object('status', p.status, 'note', p.review_note, 'uploaded_at', p.created_at)
                       FROM public.payment_proofs p WHERE p.order_id = v.id
                       ORDER BY p.created_at DESC LIMIT 1),
    'scheduled_for',  v.scheduled_for,
    'created_at',     v.created_at,
    'subtotal',       v.subtotal,
    'discount_total', v.discount_total,
    'delivery_fee',   v.delivery_fee,
    'total',          v.total,
    'branch', (SELECT jsonb_build_object('name_en', b.name_en, 'name_ar', b.name_ar, 'phone', b.phone)
               FROM public.branches b WHERE b.id = v.branch_id),
    'items', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
                'name', oi.item_name, 'quantity', oi.quantity, 'line_total', oi.line_total,
                'addons', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
                             'group', oia.group_name, 'name', oia.addon_name, 'quantity', oia.quantity)), '[]'::jsonb)
                           FROM public.order_item_addons oia WHERE oia.order_item_id = oi.id)
              )), '[]'::jsonb)
              FROM public.order_items oi WHERE oi.order_id = v.id),
    'history', (SELECT COALESCE(jsonb_agg(jsonb_build_object('status', h.to_status, 'at', h.created_at)
                 ORDER BY h.created_at), '[]'::jsonb)
                FROM public.order_status_history h WHERE h.order_id = v.id)
  ) INTO v_json;

  RETURN v_json;
END;
$$;

-- Report: cash vs InstaPay
CREATE OR REPLACE FUNCTION public.report_payment_methods(p_from date, p_to date, p_branch_id uuid DEFAULT NULL)
RETURNS TABLE (
  payment_method    public.payment_method,
  orders_completed  bigint,
  net_revenue       bigint,
  share_pct         numeric
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_scope uuid := public.report_scope(p_branch_id, p_from, p_to);
BEGIN
  RETURN QUERY
  SELECT o.payment_method,
         count(*),
         sum(o.total)::bigint,
         round(100.0 * sum(o.total) / NULLIF(sum(sum(o.total)) OVER (), 0), 1)
  FROM public.orders o
  JOIN public.branches b ON b.id = o.branch_id
  WHERE o.status = 'completed'
    AND (v_scope IS NULL OR o.branch_id = v_scope)
    AND public.business_date(o.created_at, b.timezone) BETWEEN p_from AND p_to
  GROUP BY o.payment_method
  ORDER BY 3 DESC;
END;
$$;


-- =====================================================================
-- D2. GALLERY FUNCTIONS
-- =====================================================================

-- Step 2 after uploading to bucket 'panzutti-family', path '<your user id>/<file>'.
-- Customers: max 10 uploads a day and 5 waiting for approval at once.
-- Admins: photo is published immediately as an official photo.
CREATE OR REPLACE FUNCTION public.submit_family_photo(p_file_path text, p_caption text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_me     public.profiles%ROWTYPE;
  v_admin  boolean := public.is_admin();
  v_set    public.app_settings%ROWTYPE;
  v_id     uuid;
BEGIN
  SELECT * INTO v_me FROM public.profiles WHERE id = auth.uid() AND is_active;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Please log in to share your photos';
  END IF;
  IF NOT v_admin AND split_part(p_file_path, '/', 1) <> v_me.id::text THEN
    RAISE EXCEPTION 'Invalid photo';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM storage.objects
                 WHERE bucket_id = 'panzutti-family' AND name = p_file_path) THEN
    RAISE EXCEPTION 'Upload the photo first';
  END IF;
  IF NOT v_admin THEN
    IF (SELECT count(*) FROM public.family_photos
        WHERE uploaded_by = v_me.id AND created_at > now() - interval '1 day') >= 10 THEN
      RAISE EXCEPTION 'You can share up to 10 photos a day';
    END IF;
    IF (SELECT count(*) FROM public.family_photos
        WHERE uploaded_by = v_me.id AND status = 'pending') >= 5 THEN
      RAISE EXCEPTION 'Please wait until your earlier photos are approved';
    END IF;
  END IF;

  INSERT INTO public.family_photos (file_path, caption, uploaded_by, uploader_name, is_official,
                                    status, reviewed_by, reviewed_at)
  VALUES (p_file_path, NULLIF(trim(p_caption), ''), v_me.id,
          CASE WHEN v_admin THEN 'Panzutti' ELSE NULLIF(split_part(trim(v_me.full_name), ' ', 1), '') END,
          v_admin,
          CASE WHEN v_admin THEN 'approved' ELSE 'pending' END::public.review_status,
          CASE WHEN v_admin THEN v_me.id END,
          CASE WHEN v_admin THEN now() END)
  RETURNING id INTO v_id;

  IF NOT v_admin THEN
    SELECT * INTO v_set FROM public.app_settings WHERE id;
    PERFORM public.queue_email('family_photo_admin', v_set.gallery_email,
      jsonb_build_object('uploader_name', v_me.full_name, 'uploader_email', v_me.email,
                         'caption', NULLIF(trim(p_caption), ''), 'photo_id', v_id), 'en');
  END IF;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.review_family_photo(p_photo_id uuid, p_approve boolean, p_note text DEFAULT NULL)
RETURNS public.family_photos
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v public.family_photos%ROWTYPE;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only an admin can approve photos';
  END IF;
  UPDATE public.family_photos
  SET status = CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END::public.review_status,
      reviewed_by = auth.uid(), reviewed_at = now(), review_note = NULLIF(trim(p_note), '')
  WHERE id = p_photo_id
  RETURNING * INTO v;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Photo not found';
  END IF;
  RETURN v;
END;
$$;

-- Public gallery page: approved photos, newest first (official ones can be pinned with sort_order)
CREATE OR REPLACE FUNCTION public.get_family_gallery(p_limit integer DEFAULT 30, p_offset integer DEFAULT 0)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', f.id, 'file_path', f.file_path, 'caption', f.caption,
           'uploader_name', f.uploader_name, 'is_official', f.is_official,
           'approved_at', f.reviewed_at)), '[]'::jsonb)
  FROM (SELECT * FROM public.family_photos
        WHERE status = 'approved'
        ORDER BY sort_order DESC, reviewed_at DESC
        LIMIT GREATEST(LEAST(COALESCE(p_limit, 30), 100), 1)
        OFFSET GREATEST(COALESCE(p_offset, 0), 0)) f;
$$;


-- =====================================================================
-- E2. APPLICATION FUNCTIONS
-- =====================================================================

-- Step 1 (optional): upload CV/catalog to bucket 'applications',
--   path 'incoming/<random uuid>/<file name>' (PDF, Word or image, max 10 MB)
-- Step 2: call submit_application(...)
CREATE OR REPLACE FUNCTION public.submit_application(
  p_type                 public.application_type,
  p_full_name            text,
  p_phone                text,
  p_email                text,
  p_message              text DEFAULT NULL,
  p_job_position_id      uuid DEFAULT NULL,
  p_position_other       text DEFAULT NULL,
  p_service_category_id  uuid DEFAULT NULL,
  p_company_name         text DEFAULT NULL,
  p_attachment_path      text DEFAULT NULL,
  p_locale               text DEFAULT 'en'
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_phone   text := public.normalize_phone(p_phone);
  v_email   text := lower(trim(p_email));
  v_locale  text := CASE WHEN p_locale = 'ar' THEN 'ar' ELSE 'en' END;
  v_set     public.app_settings%ROWTYPE;
  v_pos     public.job_positions%ROWTYPE;
  v_cat     public.service_categories%ROWTYPE;
  v_id      uuid;
  v_data    jsonb;
BEGIN
  IF COALESCE(trim(p_full_name), '') = '' THEN
    RAISE EXCEPTION 'Please enter your name';
  END IF;
  IF v_phone IS NULL THEN
    RAISE EXCEPTION 'Please enter a valid phone number';
  END IF;
  IF v_email IS NULL OR NOT public.is_valid_email(v_email) THEN
    RAISE EXCEPTION 'Please enter a valid email address';
  END IF;
  IF length(COALESCE(p_message, '')) > 3000 THEN
    RAISE EXCEPTION 'Your message is too long (max 3000 characters)';
  END IF;

  IF p_type = 'job' THEN
    IF p_job_position_id IS NOT NULL THEN
      SELECT * INTO v_pos FROM public.job_positions WHERE id = p_job_position_id AND is_open;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'This position is no longer open';
      END IF;
    ELSIF COALESCE(trim(p_position_other), '') = '' THEN
      RAISE EXCEPTION 'Please choose the position you are applying for';
    END IF;
  ELSE
    SELECT * INTO v_cat FROM public.service_categories WHERE id = p_service_category_id AND is_active;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Please choose what you supply';
    END IF;
  END IF;

  IF p_attachment_path IS NOT NULL THEN
    IF split_part(p_attachment_path, '/', 1) <> 'incoming'
       OR NOT EXISTS (SELECT 1 FROM storage.objects
                      WHERE bucket_id = 'applications' AND name = p_attachment_path) THEN
      RAISE EXCEPTION 'Upload the file first';
    END IF;
    IF EXISTS (SELECT 1 FROM public.applications WHERE attachment_path = p_attachment_path) THEN
      RAISE EXCEPTION 'This file was already used in another application';
    END IF;
  END IF;

  -- spam guard: max 3 applications per phone or email per day
  IF (SELECT count(*) FROM public.applications
      WHERE (phone = v_phone OR email = v_email) AND created_at > now() - interval '1 day') >= 3 THEN
    RAISE EXCEPTION 'You have already sent several applications today. We will contact you soon.';
  END IF;

  INSERT INTO public.applications (type, full_name, phone, email, job_position_id, position_other,
                                   service_category_id, company_name, message, attachment_path,
                                   locale, user_id)
  VALUES (p_type, trim(p_full_name), v_phone, v_email,
          CASE WHEN p_type = 'job' THEN p_job_position_id END,
          CASE WHEN p_type = 'job' THEN NULLIF(trim(p_position_other), '') END,
          CASE WHEN p_type = 'service_provider' THEN p_service_category_id END,
          NULLIF(trim(p_company_name), ''), NULLIF(trim(p_message), ''),
          p_attachment_path, v_locale,
          (SELECT id FROM public.profiles WHERE id = auth.uid()))
  RETURNING id INTO v_id;

  v_data := jsonb_build_object(
    'application_id', v_id, 'type', p_type, 'full_name', trim(p_full_name),
    'phone', v_phone, 'email', v_email,
    'position', COALESCE(CASE WHEN v_locale = 'ar' THEN v_pos.title_ar ELSE v_pos.title_en END,
                         NULLIF(trim(p_position_other), '')),
    'position_en', COALESCE(v_pos.title_en, NULLIF(trim(p_position_other), '')),
    'category', CASE WHEN v_locale = 'ar' THEN v_cat.name_ar ELSE v_cat.name_en END,
    'category_en', v_cat.name_en,
    'company_name', NULLIF(trim(p_company_name), ''),
    'message', NULLIF(trim(p_message), ''),
    'has_attachment', p_attachment_path IS NOT NULL);

  SELECT * INTO v_set FROM public.app_settings WHERE id;
  IF p_type = 'job' THEN
    PERFORM public.queue_email('application_job_restaurant', v_set.hr_email, v_data, 'en');
  ELSE
    PERFORM public.queue_email('application_provider_restaurant',
                               COALESCE(v_set.suppliers_email, v_set.hr_email), v_data, 'en');
  END IF;
  PERFORM public.queue_email('application_received_applicant', v_email, v_data, v_locale);

  RETURN v_id;
END;
$$;


-- =====================================================================
-- ROW LEVEL SECURITY FOR THE NEW TABLES
-- =====================================================================
ALTER TABLE public.app_settings       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_outbox       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_proofs     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.family_photos      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_positions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.applications       ENABLE ROW LEVEL SECURITY;

-- settings & email log: admins only
CREATE POLICY "Admins view settings"   ON public.app_settings FOR SELECT TO authenticated USING ((SELECT public.is_admin()));
CREATE POLICY "Admins update settings" ON public.app_settings FOR UPDATE TO authenticated
  USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));
CREATE POLICY "Admins view email log"  ON public.email_outbox FOR SELECT TO authenticated USING ((SELECT public.is_admin()));

-- payment proofs: staff of that branch, and the customer who owns the order
CREATE POLICY "View payment proofs" ON public.payment_proofs
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id));   -- orders RLS decides

-- gallery rows: approved for everyone, own uploads, everything for admins
CREATE POLICY "View family photos" ON public.family_photos
  FOR SELECT TO anon, authenticated
  USING (status = 'approved' OR uploaded_by = (SELECT auth.uid()) OR (SELECT public.is_admin()));
CREATE POLICY "Admins edit family photos" ON public.family_photos
  FOR UPDATE TO authenticated USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));
CREATE POLICY "Delete own or any (admin) family photos" ON public.family_photos
  FOR DELETE TO authenticated
  USING (uploaded_by = (SELECT auth.uid()) OR (SELECT public.is_admin()));

-- open positions & service categories: public read, admin write
CREATE POLICY "View open positions" ON public.job_positions
  FOR SELECT TO anon, authenticated USING (is_open OR (SELECT public.is_admin()));
CREATE POLICY "Admins insert positions" ON public.job_positions FOR INSERT TO authenticated WITH CHECK ((SELECT public.is_admin()));
CREATE POLICY "Admins update positions" ON public.job_positions FOR UPDATE TO authenticated
  USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));
CREATE POLICY "Admins delete positions" ON public.job_positions FOR DELETE TO authenticated USING ((SELECT public.is_admin()));

CREATE POLICY "View service categories" ON public.service_categories
  FOR SELECT TO anon, authenticated USING (is_active OR (SELECT public.is_admin()));
CREATE POLICY "Admins insert service categories" ON public.service_categories FOR INSERT TO authenticated WITH CHECK ((SELECT public.is_admin()));
CREATE POLICY "Admins update service categories" ON public.service_categories FOR UPDATE TO authenticated
  USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));
CREATE POLICY "Admins delete service categories" ON public.service_categories FOR DELETE TO authenticated USING ((SELECT public.is_admin()));

-- applications: admins only (personal data); created through submit_application
CREATE POLICY "Admins view applications"   ON public.applications FOR SELECT TO authenticated USING ((SELECT public.is_admin()));
CREATE POLICY "Admins update applications" ON public.applications FOR UPDATE TO authenticated
  USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));
CREATE POLICY "Admins delete applications" ON public.applications FOR DELETE TO authenticated USING ((SELECT public.is_admin()));

-- table permissions
GRANT SELECT ON public.family_photos, public.job_positions, public.service_categories TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_settings, public.email_outbox, public.payment_proofs,
      public.family_photos, public.job_positions, public.service_categories, public.applications TO authenticated;
-- nobody edits the email queue except the server
REVOKE INSERT, UPDATE, DELETE ON public.email_outbox FROM anon, authenticated;


-- =====================================================================
-- FUNCTION PERMISSIONS
-- =====================================================================
-- public
GRANT EXECUTE ON FUNCTION public.place_order(uuid, public.order_type, text, text, jsonb, text, text, text,
                          timestamptz, text, text, uuid, boolean, text, public.payment_method, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_checkout_suggestions(uuid[], integer)              TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_payment_proof(uuid, text, text, text)           TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_family_gallery(integer, integer)                   TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_application(public.application_type, text, text, text, text,
                          uuid, text, uuid, text, text, text)                           TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.can_upload_payment_proof(text), public.can_view_family_photo(text),
                          public.is_valid_email(text)                                   TO anon, authenticated;
-- logged in (checked inside)
REVOKE EXECUTE ON FUNCTION public.submit_family_photo(text, text)                    FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.review_family_photo(uuid, boolean, text)           FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.review_payment_proof(uuid, boolean, text)          FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.report_payment_methods(date, date, uuid)           FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.submit_family_photo(text, text),
                          public.review_family_photo(uuid, boolean, text),
                          public.review_payment_proof(uuid, boolean, text),
                          public.report_payment_methods(date, date, uuid)            TO authenticated;
-- server only (the Edge Function uses the service role)
REVOKE EXECUTE ON FUNCTION public.claim_email_batch(integer)            FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.complete_email(bigint, text)          FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.claim_email_batch(integer), public.complete_email(bigint, text) TO service_role;
REVOKE EXECUTE ON FUNCTION public.queue_email(text, text, jsonb, text)  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.queue_order_emails(uuid)              FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.dispatch_email_outbox()               FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_dispatch_email_outbox()           FROM PUBLIC, anon, authenticated;


-- =====================================================================
-- STORAGE BUCKETS + RULES
-- =====================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'storage' AND table_name = 'buckets') THEN

    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) VALUES
      ('payment-proofs',  'payment-proofs',  false, 5242880,
         ARRAY['image/jpeg','image/png','image/webp','image/heic','application/pdf']),
      ('panzutti-family', 'panzutti-family', false, 8388608,
         ARRAY['image/jpeg','image/png','image/webp','image/heic']),
      ('applications',    'applications',    false, 10485760,
         ARRAY['application/pdf','application/msword',
               'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
               'image/jpeg','image/png'])
    ON CONFLICT (id) DO NOTHING;

    -- InstaPay screenshots: anyone can upload for a valid unpaid InstaPay order; staff can view
    CREATE POLICY "Upload InstaPay screenshot" ON storage.objects
      FOR INSERT TO anon, authenticated
      WITH CHECK (bucket_id = 'payment-proofs' AND public.can_upload_payment_proof(name));
    CREATE POLICY "Staff view InstaPay screenshots" ON storage.objects
      FOR SELECT TO authenticated
      USING (bucket_id = 'payment-proofs' AND public.is_staff());

    -- Panzutti Family: logged-in users upload into their own folder; approved photos public
    CREATE POLICY "Upload family photo" ON storage.objects
      FOR INSERT TO authenticated
      WITH CHECK (bucket_id = 'panzutti-family'
                  AND (split_part(name, '/', 1) = (SELECT auth.uid())::text OR public.is_admin()));
    CREATE POLICY "View family photos" ON storage.objects
      FOR SELECT TO anon, authenticated
      USING (bucket_id = 'panzutti-family' AND public.can_view_family_photo(name));
    CREATE POLICY "Delete own or any (admin) family photo files" ON storage.objects
      FOR DELETE TO authenticated
      USING (bucket_id = 'panzutti-family'
             AND (split_part(name, '/', 1) = (SELECT auth.uid())::text OR public.is_admin()));

    -- Applications: anyone uploads into incoming/, only admins read or delete
    CREATE POLICY "Upload application file" ON storage.objects
      FOR INSERT TO anon, authenticated
      WITH CHECK (bucket_id = 'applications' AND split_part(name, '/', 1) = 'incoming');
    CREATE POLICY "Admins view application files" ON storage.objects
      FOR SELECT TO authenticated
      USING (bucket_id = 'applications' AND public.is_admin());
    CREATE POLICY "Admins delete application files" ON storage.objects
      FOR DELETE TO authenticated
      USING (bucket_id IN ('applications', 'payment-proofs') AND public.is_admin());
  END IF;
END $$;


-- =====================================================================
-- REALTIME — staff screens see new InstaPay screenshots live
-- =====================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.payment_proofs;
  END IF;
END $$;


-- =====================================================================
-- STARTER DATA
-- =====================================================================
-- Fill these in (Table editor → app_settings) — an empty address means "don't send".
INSERT INTO public.app_settings (orders_email, hr_email, suppliers_email, gallery_email)
VALUES (NULL, NULL, NULL, NULL);
-- InstaPay is switched on per branch by setting branches.instapay_address
-- (e.g. 'panzutti@instapay'). Until then place_order refuses InstaPay.

INSERT INTO public.job_positions (title_en, title_ar, sort_order) VALUES
  ('Cashier',                     'كاشير',               1),
  ('Waiter',                      'ويتر',                2),
  ('Barista',                     'باريستا',             3),
  ('Floor Manager',               'مدير صالة',           4),
  ('Financial Accountant',        'محاسب مالي',          5),
  ('Human Resources Specialist',  'أخصائي موارد بشرية', 6);

INSERT INTO public.service_categories (slug, name_en, name_ar, sort_order) VALUES
  ('fresh-produce',     'Fresh produce',             'خضروات وفواكه طازجة',  1),
  ('dairy-cheese',      'Dairy & cheese',            'ألبان وأجبان',          2),
  ('meat-poultry',      'Meat, poultry & seafood',   'لحوم ودواجن ومأكولات بحرية', 3),
  ('bakery-flour',      'Flour & bakery supplies',   'دقيق ومستلزمات مخبوزات', 4),
  ('coffee-beverages',  'Coffee & beverages',        'قهوة ومشروبات',         5),
  ('packaging',         'Packaging',                 'تغليف',                 6),
  ('cleaning',          'Cleaning & hygiene',        'نظافة وتعقيم',          7),
  ('equipment',         'Kitchen equipment & maintenance', 'معدات مطبخ وصيانة', 8),
  ('marketing',         'Marketing & media',         'تسويق ودعاية',          9),
  ('delivery',          'Delivery & logistics',      'توصيل ولوجستيات',      10),
  ('other',             'Other',                     'أخرى',                 11);

-- a few real drinks/desserts to suggest at checkout
INSERT INTO public.menu_items (category_id, slug, name_en, name_ar, description_en, price, is_signature, sort_order, suggest_at_checkout)
SELECT c.id, x.slug, x.name_en, x.name_ar, x.description_en, x.price, x.is_signature, x.sort_order, true
FROM (VALUES
  ('refreshers',     'lemon-mint',      'Lemon Mint',       'ليمون نعناع',     NULL, 7500, false, 1),
  ('signatures',     'kiwi-chiller',    'Kiwi Chiller',     'كيوي تشيلر',
     'Fresh kiwi and mint blended into the ultimate refreshing chill.', 17500, false, 1),
  ('signatures',     'fizz-craft',      'Fizz Craft',       'فيز كرافت',
     'Mixed berries meet peach in a sparkling citrus refresher.', 17500, true, 2),
  ('sweet-panuozzo', 'nutella-panuozzo','Nutella Panuozzo', 'بانوتزو نوتيلا',
     'An irresistible, freshly made cocoa-dough panuozzo filled generously with creamy Nutella.', 18500, true, 1),
  ('sweet-panuozzo', 'iconic-tiramisu', 'Iconic Tiramisu',  'تيراميسو',
     'Rich mascarpone cream, coffee-soaked lady fingers, and a cocoa powder finish.', 29500, false, 2)
) AS x(category_slug, slug, name_en, name_ar, description_en, price, is_signature, sort_order)
JOIN public.menu_categories c ON c.slug = x.category_slug;

UPDATE public.menu_items SET suggest_at_checkout = true
WHERE slug IN ('espresso', 'fried-truffle-buffalo-balls');


-- =====================================================================
-- F2. EMAIL WIRING (pg_net + pg_cron)
--   Run once, after deploying the 'send-emails' Edge Function:
--
--   select vault.create_secret('https://<project-ref>.supabase.co/functions/v1/send-emails',
--                              'panzutti_email_function_url');
--   select vault.create_secret('<project anon / publishable key>',
--                              'panzutti_email_function_key');
--
--   Edge Function secrets (Dashboard → Edge Functions → Secrets):
--     GMAIL_USER          the Gmail address that sends (e.g. panzutti.orders@gmail.com)
--     GMAIL_APP_PASSWORD  a 16-character Google "App password" (needs 2-Step Verification)
--     EMAIL_REPLY_TO      optional reply-to address
-- =====================================================================
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- retry anything not sent yet, every 5 minutes
SELECT cron.schedule('panzutti-send-emails', '*/5 * * * *', $cron$ SELECT public.dispatch_email_outbox(); $cron$);
