-- =====================================================================
-- Panzutti — v6: cashier and driver roles, driver deliveries (2026-10-29)
-- Run after v1 … v5. Safe to run again.
--
-- Roles (profiles.role)
--   admin    everything, every branch, manages users (admin panel → Users)
--   staff    branch orders, InstaPay, sold-out switches, points, reports
--   cashier  like staff but no reports (orders, InstaPay, sold-out, points)
--   driver   only delivery orders of their branch: the ones "ready" and not
--            taken yet, plus the ones they took. Takes an order (ready →
--            out for delivery, orders.driver_id = them) and marks it
--            delivered (→ completed, cash marked paid). Nothing else.
--   customer website only
--
--   New users are created by the admin panel through the admin-users Edge
--   Function (it needs the service-role key, which never leaves Supabase).
--   Roles/branches of existing accounts are changed with a plain UPDATE on
--   profiles, which the "Admins manage profiles" policy already allows.
--
-- Note: the new enum values can't be used in the same transaction they are
-- added in, so everything below compares role::text.
-- =====================================================================

ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'cashier';
ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'driver';

-- ---------------------------------------------------------------- 1. role helpers
CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(public.app_role()::text IN ('staff', 'admin', 'cashier'), false);
$$;

CREATE OR REPLACE FUNCTION public.can_access_branch(p_branch_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE((
    SELECT p.role::text = 'admin'
        OR (p.role::text IN ('staff', 'cashier') AND (p.branch_id IS NULL OR p.branch_id = p_branch_id))
    FROM public.profiles p
    WHERE p.id = auth.uid() AND p.is_active
  ), false);
$$;

-- An active driver working at this branch (no branch = every branch)
CREATE OR REPLACE FUNCTION public.is_driver_for(p_branch_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE((
    SELECT p.role::text = 'driver' AND (p.branch_id IS NULL OR p.branch_id = p_branch_id)
    FROM public.profiles p
    WHERE p.id = auth.uid() AND p.is_active
  ), false);
$$;
GRANT EXECUTE ON FUNCTION public.is_driver_for(uuid) TO authenticated;

-- ---------------------------------------------------------------- 2. orders.driver_id + what drivers can see
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS driver_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS orders_driver_idx ON public.orders (driver_id) WHERE driver_id IS NOT NULL;

-- Order items/add-ons/history policies look orders up through RLS, so they follow this automatically.
DROP POLICY IF EXISTS "Drivers view their delivery orders" ON public.orders;
CREATE POLICY "Drivers view their delivery orders" ON public.orders FOR SELECT TO authenticated
  USING (
    type = 'delivery'
    AND public.is_driver_for(branch_id)
    AND (driver_id = (SELECT auth.uid()) OR (status = 'ready' AND driver_id IS NULL))
  );

-- ---------------------------------------------------------------- 3. driver actions
-- Take a ready delivery order: ready → out_for_delivery, assigned to the caller.
CREATE OR REPLACE FUNCTION public.driver_take_order(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v public.orders%ROWTYPE;
BEGIN
  SELECT * INTO v FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND OR v.type <> 'delivery' OR NOT public.is_driver_for(v.branch_id) THEN
    RAISE EXCEPTION 'Order not found';
  END IF;
  IF v.driver_id IS NOT NULL AND v.driver_id <> auth.uid() THEN
    RAISE EXCEPTION 'Another driver already took this order';
  END IF;
  IF v.status <> 'ready' THEN
    RAISE EXCEPTION 'This order is not ready yet';
  END IF;
  UPDATE public.orders
  SET status = 'out_for_delivery', driver_id = auth.uid(), handled_by = auth.uid()
  WHERE id = p_order_id;
END;
$$;

-- Mark the caller's order delivered: out_for_delivery → completed. Cash counts as collected.
CREATE OR REPLACE FUNCTION public.driver_complete_order(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v public.orders%ROWTYPE;
BEGIN
  SELECT * INTO v FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND OR v.driver_id IS DISTINCT FROM auth.uid() OR NOT public.is_driver_for(v.branch_id) THEN
    RAISE EXCEPTION 'Order not found';
  END IF;
  IF v.status <> 'out_for_delivery' THEN
    RAISE EXCEPTION 'This order is not out for delivery';
  END IF;
  IF v.payment_method = 'instapay' AND v.payment_status <> 'paid' THEN
    RAISE EXCEPTION 'The InstaPay transfer is not approved yet — call the restaurant';
  END IF;
  UPDATE public.orders
  SET status = 'completed', payment_status = 'paid', paid_at = COALESCE(paid_at, now()), handled_by = auth.uid()
  WHERE id = p_order_id;
END;
$$;

-- Staff/cashier/admin hand an order to a driver (or take it back with NULL)
CREATE OR REPLACE FUNCTION public.assign_driver(p_order_id uuid, p_driver_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v public.orders%ROWTYPE;
BEGIN
  SELECT * INTO v FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND OR NOT (public.is_staff() AND public.can_access_branch(v.branch_id)) THEN
    RAISE EXCEPTION 'Order not found';
  END IF;
  IF v.type <> 'delivery' THEN
    RAISE EXCEPTION 'Only delivery orders have a driver';
  END IF;
  IF v.status IN ('completed', 'cancelled') THEN
    RAISE EXCEPTION 'This order is already closed';
  END IF;
  IF p_driver_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.profiles p
       WHERE p.id = p_driver_id AND p.is_active AND p.role::text = 'driver'
         AND (p.branch_id IS NULL OR p.branch_id = v.branch_id)) THEN
    RAISE EXCEPTION 'That person is not an active driver for this branch';
  END IF;
  UPDATE public.orders SET driver_id = p_driver_id WHERE id = p_order_id;
END;
$$;

REVOKE ALL ON FUNCTION public.driver_take_order(uuid), public.driver_complete_order(uuid),
                       public.assign_driver(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.driver_take_order(uuid), public.driver_complete_order(uuid),
                          public.assign_driver(uuid, uuid) TO authenticated;

-- ---------------------------------------------------------------- 4. reports stay staff/admin only
-- report_scope already refuses every role except staff and admin, so cashiers and drivers get no reports.

NOTIFY pgrst, 'reload schema';
