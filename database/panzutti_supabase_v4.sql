-- =====================================================================
-- Panzutti — v4: VAT, service charge and table reservations (2026-10-24)
-- Run after panzutti_supabase.sql, _v2.sql and _v3.sql.
--
-- 1. Taxes
--    branches.tax_rate (default 0.14 = 14% VAT) and branches.service_rate
--    (default 0.12 = 12% service, reservations only).
--    place_order copies the rates onto the order, so later rate changes
--    never rewrite old orders. Orders placed before v4 keep rate 0.
--      base           = max(subtotal - discount_total, 0)
--      service_total  = round(base × service_rate)            (reservations)
--      tax_total      = round((base + service_total) × tax_rate)
--      total          = base + service_total + tax_total + delivery_fee
--    service_total, tax_total and total are generated columns.
--
-- 2. Reservations
--    orders.is_reservation + orders.party_size. A reservation is a dine-in
--    order: type = 'pickup', scheduled_for = the table time (required,
--    15 minutes – 30 days ahead, inside opening hours), pre-ordered items.
--    place_order gets p_reservation and p_party_size (old signature dropped,
--    every old call keeps working because the new params have defaults).
--    Reservation emails always go to the restaurant (even when pickup
--    emails are switched off).
--
-- 3. Tracking by phone only
--    find_orders_by_phone: orders from the last 7 days plus any upcoming
--    reservation, max 20, now with is_reservation / scheduled_for.
-- =====================================================================

-- ---------------------------------------------------------------- 1. columns
ALTER TABLE public.branches
  ADD COLUMN IF NOT EXISTS tax_rate     numeric(5,4) NOT NULL DEFAULT 0.14 CHECK (tax_rate >= 0 AND tax_rate < 1),
  ADD COLUMN IF NOT EXISTS service_rate numeric(5,4) NOT NULL DEFAULT 0.12 CHECK (service_rate >= 0 AND service_rate < 1);

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS is_reservation boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS party_size     smallint CHECK (party_size BETWEEN 1 AND 30),
  ADD COLUMN IF NOT EXISTS tax_rate       numeric(5,4) NOT NULL DEFAULT 0 CHECK (tax_rate >= 0 AND tax_rate < 1),
  ADD COLUMN IF NOT EXISTS service_rate   numeric(5,4) NOT NULL DEFAULT 0 CHECK (service_rate >= 0 AND service_rate < 1);

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS service_total integer GENERATED ALWAYS AS (
    round(GREATEST(subtotal - discount_total, 0) * service_rate)::integer
  ) STORED,
  ADD COLUMN IF NOT EXISTS tax_total integer GENERATED ALWAYS AS (
    round((GREATEST(subtotal - discount_total, 0)
           + round(GREATEST(subtotal - discount_total, 0) * service_rate)) * tax_rate)::integer
  ) STORED;

-- Postgres 17: change the generated expression in place
ALTER TABLE public.orders ALTER COLUMN total SET EXPRESSION AS (
  GREATEST(subtotal - discount_total, 0)
  + round(GREATEST(subtotal - discount_total, 0) * service_rate)::integer
  + round((GREATEST(subtotal - discount_total, 0)
           + round(GREATEST(subtotal - discount_total, 0) * service_rate)) * tax_rate)::integer
  + delivery_fee
);

CREATE INDEX IF NOT EXISTS orders_reservation_time_idx
  ON public.orders (branch_id, scheduled_for) WHERE is_reservation;

-- ---------------------------------------------------------------- 2. place_order
DROP FUNCTION IF EXISTS public.place_order(uuid, order_type, text, text, jsonb, text, text, text,
  timestamptz, text, text, uuid, boolean, text, payment_method, text);

CREATE FUNCTION public.place_order(
  p_branch_id uuid, p_type order_type, p_customer_name text, p_customer_phone text, p_items jsonb,
  p_delivery_address text DEFAULT NULL, p_delivery_notes text DEFAULT NULL, p_note text DEFAULT NULL,
  p_scheduled_for timestamptz DEFAULT NULL, p_promo_code text DEFAULT NULL, p_locale text DEFAULT 'en',
  p_address_id uuid DEFAULT NULL, p_save_address boolean DEFAULT false, p_address_label text DEFAULT NULL,
  p_payment_method payment_method DEFAULT 'cash', p_customer_email text DEFAULT NULL,
  p_reservation boolean DEFAULT false, p_party_size integer DEFAULT NULL)
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
  v_resv        boolean := COALESCE(p_reservation, false);
  v_type        public.order_type := CASE WHEN COALESCE(p_reservation, false) THEN 'pickup' ELSE p_type END;
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
  IF v_type = 'pickup' AND NOT v_resv AND NOT v_branch.accepts_pickup THEN
    RAISE EXCEPTION 'This branch is not taking pickup orders right now';
  END IF;
  IF v_type = 'delivery' AND NOT v_branch.accepts_delivery THEN
    RAISE EXCEPTION 'This branch is not taking delivery orders right now';
  END IF;
  IF v_method = 'instapay' AND (NOT v_branch.accepts_instapay OR v_branch.instapay_address IS NULL) THEN
    RAISE EXCEPTION 'InstaPay is not available at this branch right now';
  END IF;

  IF v_resv THEN
    IF p_scheduled_for IS NULL THEN
      RAISE EXCEPTION 'Please choose a time for your reservation';
    END IF;
    IF p_party_size IS NULL OR p_party_size < 1 OR p_party_size > 30 THEN
      RAISE EXCEPTION 'Number of guests must be between 1 and 30';
    END IF;
    IF p_scheduled_for < now() + interval '15 minutes' OR p_scheduled_for > now() + interval '30 days' THEN
      RAISE EXCEPTION 'Reservations must be between 15 minutes and 30 days from now';
    END IF;
  END IF;

  IF v_type = 'delivery' AND p_address_id IS NOT NULL THEN
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
  IF v_type = 'delivery' AND v_address IS NULL THEN
    RAISE EXCEPTION 'Please enter a delivery address';
  END IF;
  IF v_type = 'delivery' AND p_address_id IS NULL AND p_save_address THEN
    IF auth.uid() IS NULL THEN
      RAISE EXCEPTION 'Log in to save addresses';
    END IF;
    INSERT INTO public.customer_addresses (user_id, label, address, notes, last_used_at)
    VALUES (auth.uid(), COALESCE(NULLIF(trim(p_address_label), ''), 'Home'), v_address, v_addr_notes, now())
    RETURNING id INTO v_address_id;
  END IF;
  IF NOT v_resv AND p_scheduled_for IS NOT NULL
     AND (p_scheduled_for < now() + interval '15 minutes'
          OR p_scheduled_for > now() + interval '7 days') THEN
    RAISE EXCEPTION 'Scheduled time must be between 15 minutes and 7 days from now';
  END IF;
  IF NOT public.is_branch_open(p_branch_id, COALESCE(p_scheduled_for, now())) THEN
    RAISE EXCEPTION 'The branch is closed at that time (open % – %)',
      to_char(v_branch.opens_at, 'HH12:MI AM'), to_char(v_branch.closes_at, 'HH12:MI AM');
  END IF;

  SELECT id, COALESCE(v_email, email) INTO v_user, v_email FROM public.profiles WHERE id = auth.uid();
  IF v_user IS NULL THEN
    v_email := NULLIF(lower(trim(p_customer_email)), '');
  END IF;

  INSERT INTO public.orders (branch_id, user_id, type, customer_name, customer_phone, customer_email,
                             delivery_address, delivery_notes, customer_address_id,
                             scheduled_for, note, delivery_fee, locale, payment_method,
                             is_reservation, party_size, tax_rate, service_rate)
  VALUES (p_branch_id, v_user, v_type, trim(p_customer_name), v_phone, v_email,
          CASE WHEN v_type = 'delivery' THEN v_address END,
          CASE WHEN v_type = 'delivery' THEN v_addr_notes END,
          CASE WHEN v_type = 'delivery' THEN v_address_id END,
          p_scheduled_for, NULLIF(trim(p_note), ''),
          CASE WHEN v_type = 'delivery' THEN v_branch.delivery_fee ELSE 0 END,
          v_locale, v_method,
          v_resv, CASE WHEN v_resv THEN p_party_size END,
          v_branch.tax_rate, CASE WHEN v_resv THEN v_branch.service_rate ELSE 0 END)
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

  IF v_type = 'delivery' AND v_subtotal < v_branch.min_delivery_order THEN
    RAISE EXCEPTION 'The minimum order for delivery is % EGP',
      to_char(v_branch.min_delivery_order / 100.0, 'FM999999990.00');
  END IF;

  IF NULLIF(trim(p_promo_code), '') IS NOT NULL THEN
    SELECT * INTO v_promo
    FROM public.validate_promo_code(p_promo_code, p_branch_id, v_type, v_subtotal, v_phone);

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
           'is_reservation', o.is_reservation, 'party_size', o.party_size, 'scheduled_for', o.scheduled_for,
           'subtotal', o.subtotal, 'discount_total', o.discount_total,
           'service_total', o.service_total, 'tax_total', o.tax_total,
           'delivery_fee', o.delivery_fee, 'total', o.total)
  INTO v_result
  FROM public.orders o WHERE o.id = v_order_id;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.place_order(uuid, order_type, text, text, jsonb, text, text, text,
  timestamptz, text, text, uuid, boolean, text, payment_method, text, boolean, integer)
  TO anon, authenticated;

-- ---------------------------------------------------------------- 3. track_order (+ tax/service/reservation)
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
    'is_reservation', v.is_reservation,
    'party_size',     v.party_size,
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
    'service_total',  v.service_total,
    'tax_total',      v.tax_total,
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

-- ---------------------------------------------------------------- 4. find_orders_by_phone (phone-only tracking)
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
             o.total, o.created_at, o.is_reservation, o.party_size, o.scheduled_for
      FROM public.orders o
      WHERE o.customer_phone = v_phone
        AND (o.created_at > now() - interval '7 days'
             OR (o.is_reservation AND o.scheduled_for > now() - interval '1 day'))
      ORDER BY o.created_at DESC
      LIMIT 20
    ) x
  ), '[]'::jsonb);
END;
$$;

-- ---------------------------------------------------------------- 5. emails: tax lines + reservations always notify
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
  IF v.type = 'pickup' AND NOT v.is_reservation AND NOT COALESCE(v_set.email_pickup_orders, false) THEN
    RETURN;
  END IF;
  SELECT * INTO v_branch FROM public.branches WHERE id = v.branch_id;

  v_data := jsonb_build_object(
    'order_id', v.id, 'order_number', v.order_number,
    'type', CASE WHEN v.is_reservation THEN 'reservation' ELSE v.type::text END,
    'is_reservation', v.is_reservation, 'party_size', v.party_size,
    'customer_name', v.customer_name, 'customer_phone', v.customer_phone,
    'customer_email', v.customer_email,
    'delivery_address', v.delivery_address, 'delivery_notes', v.delivery_notes,
    'note', v.note, 'scheduled_for', v.scheduled_for,
    'payment_method', v.payment_method, 'instapay_address', v_branch.instapay_address,
    'subtotal', v.subtotal, 'discount_total', v.discount_total, 'promo_code', v.promo_code,
    'service_total', v.service_total, 'tax_total', v.tax_total,
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

-- ---------------------------------------------------------------- 6. report: VAT, service and reservations (admin Reports page)
-- Same rules as the other report_* functions: completed orders, business day, staff see their branch.
CREATE OR REPLACE FUNCTION public.report_tax_summary(p_from date, p_to date, p_branch_id uuid DEFAULT NULL)
RETURNS TABLE(vat_total bigint, service_total bigint, net_before_tax bigint,
              reservations_placed bigint, reservations_completed bigint, reservation_guests bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $
DECLARE v_scope uuid := public.report_scope(p_branch_id, p_from, p_to);
BEGIN
  RETURN QUERY
  SELECT COALESCE(sum(o.tax_total)     FILTER (WHERE o.status = 'completed'), 0)::bigint,
         COALESCE(sum(o.service_total) FILTER (WHERE o.status = 'completed'), 0)::bigint,
         COALESCE(sum(o.total - o.tax_total) FILTER (WHERE o.status = 'completed'), 0)::bigint,
         count(o.id) FILTER (WHERE o.is_reservation),
         count(o.id) FILTER (WHERE o.is_reservation AND o.status = 'completed'),
         COALESCE(sum(o.party_size) FILTER (WHERE o.is_reservation AND o.status <> 'cancelled'), 0)::bigint
  FROM public.orders o
  JOIN public.branches b ON b.id = o.branch_id
  WHERE (v_scope IS NULL OR o.branch_id = v_scope)
    AND public.business_date(o.created_at, b.timezone) BETWEEN p_from AND p_to;
END;
$;
REVOKE ALL ON FUNCTION public.report_tax_summary(date, date, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.report_tax_summary(date, date, uuid) TO authenticated;

-- Make the API (PostgREST) see the new place_order signature right away
NOTIFY pgrst, 'reload schema';
