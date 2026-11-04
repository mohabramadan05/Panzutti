-- =====================================================================
-- Panzutti v8 — delivery fee by kilometre distance
-- Run after v7, whole file, in Supabase → SQL Editor. Safe to re-run.
--
--   fee = branches.delivery_fee (base)
--       + branches.delivery_per_km × every started km beyond delivery_included_km
--
-- Distance is the straight line between branches.latitude/longitude and the customer's map pin.
-- Nothing changes until an admin sets the branch location (admin panel → Delivery prices):
-- while latitude is NULL, place_order keeps charging the fixed delivery_fee and no pin is required.
-- =====================================================================

-- ---------------------------------------------------------------- 1. columns
ALTER TABLE public.branches
  ADD COLUMN IF NOT EXISTS latitude             numeric(9,6),
  ADD COLUMN IF NOT EXISTS longitude            numeric(9,6),
  ADD COLUMN IF NOT EXISTS delivery_per_km      integer      NOT NULL DEFAULT 0,  -- piasters per km
  ADD COLUMN IF NOT EXISTS delivery_included_km numeric(5,2) NOT NULL DEFAULT 0,  -- km covered by the base fee
  ADD COLUMN IF NOT EXISTS delivery_max_km      numeric(5,2);                     -- NULL = no limit

ALTER TABLE public.branches DROP CONSTRAINT IF EXISTS branches_delivery_distance_check;
ALTER TABLE public.branches ADD CONSTRAINT branches_delivery_distance_check CHECK (
  (latitude IS NULL) = (longitude IS NULL)
  AND (latitude IS NULL OR latitude BETWEEN -90 AND 90)
  AND (longitude IS NULL OR longitude BETWEEN -180 AND 180)
  AND delivery_per_km >= 0
  AND delivery_included_km >= 0
  AND (delivery_max_km IS NULL OR delivery_max_km > 0)
);

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS delivery_latitude    numeric(9,6),
  ADD COLUMN IF NOT EXISTS delivery_longitude   numeric(9,6),
  ADD COLUMN IF NOT EXISTS delivery_distance_km numeric(6,2);

-- ---------------------------------------------------------------- 2. straight-line distance (haversine)
-- Same formula as distanceKm() in src/lib/delivery.ts
CREATE OR REPLACE FUNCTION public.distance_km(
  p_lat1 double precision, p_lng1 double precision, p_lat2 double precision, p_lng2 double precision)
RETURNS double precision
LANGUAGE sql IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT 2 * 6371 * asin(sqrt(LEAST(1,
    power(sin(radians(p_lat2 - p_lat1) / 2), 2)
    + cos(radians(p_lat1)) * cos(radians(p_lat2)) * power(sin(radians(p_lng2 - p_lng1) / 2), 2))));
$$;

-- ---------------------------------------------------------------- 3. place_order (+ p_delivery_lat, p_delivery_lng)
DROP FUNCTION IF EXISTS public.place_order(uuid, order_type, text, text, jsonb, text, text, text,
  timestamptz, text, text, uuid, boolean, text, payment_method, text, boolean, integer, integer);
DROP FUNCTION IF EXISTS public.place_order(uuid, order_type, text, text, jsonb, text, text, text,
  timestamptz, text, text, uuid, boolean, text, payment_method, text, boolean, integer, integer,
  double precision, double precision);

CREATE FUNCTION public.place_order(
  p_branch_id uuid, p_type order_type, p_customer_name text, p_customer_phone text, p_items jsonb,
  p_delivery_address text DEFAULT NULL, p_delivery_notes text DEFAULT NULL, p_note text DEFAULT NULL,
  p_scheduled_for timestamptz DEFAULT NULL, p_promo_code text DEFAULT NULL, p_locale text DEFAULT 'en',
  p_address_id uuid DEFAULT NULL, p_save_address boolean DEFAULT false, p_address_label text DEFAULT NULL,
  p_payment_method payment_method DEFAULT 'cash', p_customer_email text DEFAULT NULL,
  p_reservation boolean DEFAULT false, p_party_size integer DEFAULT NULL,
  p_redeem_points integer DEFAULT 0,
  p_delivery_lat double precision DEFAULT NULL, p_delivery_lng double precision DEFAULT NULL)
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
  v_set         public.app_settings%ROWTYPE;
  v_blocks      integer;
  v_left        integer;
  v_pts_used    integer := 0;
  v_pts_value   integer := 0;
  v_lat         double precision := p_delivery_lat;
  v_lng         double precision := p_delivery_lng;
  v_km          double precision;
  v_fee         integer;
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
    v_lat := COALESCE(v_lat, v_saved.latitude);
    v_lng := COALESCE(v_lng, v_saved.longitude);
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

  -- v8: delivery fee by distance. Off (fixed delivery_fee) until the branch has a location.
  IF (v_lat IS NULL) <> (v_lng IS NULL)
     OR v_lat NOT BETWEEN -90 AND 90 OR v_lng NOT BETWEEN -180 AND 180 THEN
    RAISE EXCEPTION 'That map location is not valid. Please pin it again';
  END IF;
  v_fee := v_branch.delivery_fee;
  IF v_type = 'delivery' AND v_branch.latitude IS NOT NULL AND v_branch.longitude IS NOT NULL THEN
    IF v_lat IS NULL THEN
      RAISE EXCEPTION 'Please pin your location on the map so we can work out the delivery fee';
    END IF;
    v_km := public.distance_km(v_branch.latitude, v_branch.longitude, v_lat, v_lng);
    IF v_branch.delivery_max_km IS NOT NULL AND v_km > v_branch.delivery_max_km THEN
      RAISE EXCEPTION 'You are % km away. We deliver up to % km from the restaurant',
        round(v_km::numeric, 1), trim_scale(v_branch.delivery_max_km);
    END IF;
    v_fee := v_branch.delivery_fee
           + ceil(GREATEST(v_km - v_branch.delivery_included_km, 0))::integer * v_branch.delivery_per_km;
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
                             is_reservation, party_size, tax_rate, service_rate,
                             delivery_latitude, delivery_longitude, delivery_distance_km)
  VALUES (p_branch_id, v_user, v_type, trim(p_customer_name), v_phone, v_email,
          CASE WHEN v_type = 'delivery' THEN v_address END,
          CASE WHEN v_type = 'delivery' THEN v_addr_notes END,
          CASE WHEN v_type = 'delivery' THEN v_address_id END,
          p_scheduled_for, NULLIF(trim(p_note), ''),
          CASE WHEN v_type = 'delivery' THEN v_fee ELSE 0 END,
          v_locale, v_method,
          v_resv, CASE WHEN v_resv THEN p_party_size END,
          v_branch.tax_rate, CASE WHEN v_resv THEN v_branch.service_rate ELSE 0 END,
          CASE WHEN v_type = 'delivery' THEN v_lat END,
          CASE WHEN v_type = 'delivery' THEN v_lng END,
          round(v_km::numeric, 2))
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

  -- v5: pay part of the order with loyalty points (after the promo, before the emails)
  IF COALESCE(p_redeem_points, 0) > 0 THEN
    SELECT * INTO v_set FROM public.app_settings WHERE id;
    IF NOT COALESCE(v_set.loyalty_enabled, false) THEN
      RAISE EXCEPTION 'Points can''t be used right now';
    END IF;
    v_blocks := p_redeem_points / v_set.loyalty_redeem_points;
    IF v_blocks < 1 THEN
      RAISE EXCEPTION 'You need at least % points to get a discount', v_set.loyalty_redeem_points;
    END IF;
    SELECT GREATEST(subtotal - discount_total, 0) INTO v_left FROM public.orders WHERE id = v_order_id;
    IF v_set.loyalty_redeem_value > 0 THEN
      -- never spend more blocks than needed to cover what is left to pay
      v_blocks := LEAST(v_blocks, ceil(v_left::numeric / v_set.loyalty_redeem_value)::integer);
    END IF;
    v_pts_value := LEAST(v_blocks * v_set.loyalty_redeem_value, v_left);
    v_pts_used  := v_blocks * v_set.loyalty_redeem_points;
    IF v_blocks < 1 OR v_pts_value <= 0 THEN
      RAISE EXCEPTION 'There is nothing left to pay with points';
    END IF;

    -- conditional update = no double spending when two orders race
    UPDATE public.loyalty_accounts SET points = points - v_pts_used
    WHERE phone = v_phone AND points >= v_pts_used;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'You don''t have enough points for that';
    END IF;
    INSERT INTO public.loyalty_transactions (phone, order_id, delta, reason, created_by)
    VALUES (v_phone, v_order_id, -v_pts_used, 'redeem', auth.uid());

    UPDATE public.orders
    SET points_redeemed = v_pts_used,
        points_discount = v_pts_value,
        discount_total  = discount_total + v_pts_value
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
           'delivery_fee', o.delivery_fee, 'delivery_distance_km', o.delivery_distance_km, 'total', o.total,
           'points_redeemed', o.points_redeemed, 'points_discount', o.points_discount)
  INTO v_result
  FROM public.orders o WHERE o.id = v_order_id;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.place_order(uuid, order_type, text, text, jsonb, text, text, text,
  timestamptz, text, text, uuid, boolean, text, payment_method, text, boolean, integer, integer,
  double precision, double precision)
  TO anon, authenticated;
