-- =====================================================================
-- Panzutti v9: free delivery on promo codes
-- Run after v8, whole file, in Supabase → SQL Editor. Safe to re-run.
--
--   promo_codes.free_delivery boolean (default false) — an extra on top of the normal discount:
--     · percent / fixed discount as before, PLUS the order's delivery_fee becomes 0
--     · a code can be free delivery only: discount_value may then be 0
--     · free delivery only applies to delivery orders. On pickup / reservations the normal
--       discount still works; a free-delivery-only code (discount_value = 0) is refused there.
--
-- place_order is NOT rewritten: it keeps calling validate_promo_code and then sets
-- orders.promo_code_id; the trigger in section 4 zeroes delivery_fee at that moment,
-- before the emails are queued and the totals are returned.
-- =====================================================================

-- ---------------------------------------------------------------- 1. column
ALTER TABLE public.promo_codes
  ADD COLUMN IF NOT EXISTS free_delivery boolean NOT NULL DEFAULT false;

-- ---------------------------------------------------------------- 2. discount_value may be 0 for free-delivery codes
ALTER TABLE public.promo_codes DROP CONSTRAINT IF EXISTS promo_codes_discount_value_check;

-- An earlier draft of this file added a 'free_delivery' value to discount_type instead.
-- If that draft was run, turn those codes into "fixed 0 + free_delivery" (the enum value stays, unused).
UPDATE public.promo_codes
SET free_delivery = true, discount_type = 'fixed', discount_value = 0
WHERE discount_type::text = 'free_delivery';
ALTER TABLE public.promo_codes ADD CONSTRAINT promo_codes_discount_value_check CHECK (
  discount_value > 0 OR (free_delivery AND discount_value = 0)
);

-- ---------------------------------------------------------------- 3. validate_promo_code (+ free_delivery column)
-- Return type changes, so drop first. place_order reads it with SELECT * INTO a record: the extra column is fine.
DROP FUNCTION IF EXISTS public.validate_promo_code(text, uuid, public.order_type, integer, text);

CREATE FUNCTION public.validate_promo_code(
  p_code       text,
  p_branch_id  uuid,
  p_type       public.order_type,
  p_subtotal   integer,
  p_phone      text DEFAULT NULL
)
RETURNS TABLE (promo_id uuid, promo_code text, discount_amount integer, free_delivery boolean)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v        public.promo_codes%ROWTYPE;
  v_phone  text := public.normalize_phone(p_phone);
  v_used   integer;
  v_disc   integer;
BEGIN
  SELECT * INTO v FROM public.promo_codes pc
  WHERE upper(pc.code) = upper(trim(p_code))
  FOR UPDATE;                                   -- stops two orders racing for the last use

  IF NOT FOUND OR NOT v.is_active THEN
    RAISE EXCEPTION 'This promo code is not valid';
  END IF;
  IF v.starts_at IS NOT NULL AND now() < v.starts_at THEN
    RAISE EXCEPTION 'This promo code is not active yet';
  END IF;
  IF v.ends_at IS NOT NULL AND now() >= v.ends_at THEN
    RAISE EXCEPTION 'This promo code has expired';
  END IF;
  IF v.branch_id IS NOT NULL AND v.branch_id <> p_branch_id THEN
    RAISE EXCEPTION 'This promo code is not valid at this branch';
  END IF;
  IF v.order_type IS NOT NULL AND v.order_type <> p_type THEN
    RAISE EXCEPTION 'This promo code is only valid for % orders', v.order_type;
  END IF;
  -- free delivery only, and this is not a delivery order: nothing to give
  IF v.free_delivery AND v.discount_value = 0 AND p_type <> 'delivery' THEN
    RAISE EXCEPTION 'This promo code gives free delivery, so it only works on delivery orders';
  END IF;
  IF p_subtotal < v.min_order_total THEN
    RAISE EXCEPTION 'The minimum order for this code is % EGP',
      to_char(v.min_order_total / 100.0, 'FM999999990.00');
  END IF;
  IF v.usage_limit IS NOT NULL THEN
    SELECT count(*) INTO v_used FROM public.orders o
    WHERE o.promo_code_id = v.id AND o.status <> 'cancelled';
    IF v_used >= v.usage_limit THEN
      RAISE EXCEPTION 'This promo code has reached its usage limit';
    END IF;
  END IF;
  IF v.per_user_limit IS NOT NULL AND v_phone IS NOT NULL THEN
    SELECT count(*) INTO v_used FROM public.orders o
    WHERE o.promo_code_id = v.id AND o.customer_phone = v_phone AND o.status <> 'cancelled';
    IF v_used >= v.per_user_limit THEN
      RAISE EXCEPTION 'You have already used this promo code';
    END IF;
  END IF;

  IF v.discount_value = 0 THEN
    v_disc := 0;                                -- free delivery only (section 4)
  ELSIF v.discount_type = 'percent' THEN
    v_disc := floor(p_subtotal * v.discount_value / 100.0);
    IF v.max_discount IS NOT NULL THEN v_disc := LEAST(v_disc, v.max_discount); END IF;
  ELSE
    v_disc := LEAST(v.discount_value, p_subtotal);
  END IF;

  RETURN QUERY SELECT v.id, v.code, v_disc, (v.free_delivery AND p_type = 'delivery');
END;
$$;

GRANT EXECUTE ON FUNCTION public.validate_promo_code(text, uuid, public.order_type, integer, text) TO anon, authenticated;

-- ---------------------------------------------------------------- 4. free-delivery code attached → delivery_fee = 0
CREATE OR REPLACE FUNCTION public.apply_free_delivery_promo()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.promo_code_id IS NOT NULL
     AND NEW.type = 'delivery'
     AND EXISTS (SELECT 1 FROM public.promo_codes pc
                 WHERE pc.id = NEW.promo_code_id AND pc.free_delivery) THEN
    NEW.delivery_fee := 0;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.apply_free_delivery_promo() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS orders_free_delivery_promo ON public.orders;
CREATE TRIGGER orders_free_delivery_promo
  BEFORE INSERT OR UPDATE OF promo_code_id, delivery_fee ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.apply_free_delivery_promo();
