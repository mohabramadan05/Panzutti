-- =====================================================================
--  PANZUTTI — Supabase database script
--  Users · Branches · Menu with add-on groups · Orders (pickup/delivery,
--  cash only) · Promo codes · Order history
--
--  HOW TO RUN
--    Supabase dashboard → SQL Editor → New query → paste this whole file
--    → Run. Run it once on a fresh project.
--
--  AFTER RUNNING
--    1. Sign up your own account in the app (or Authentication → Add user).
--    2. Make yourself admin (run in SQL Editor):
--         update public.profiles set role = 'admin' where email = 'you@example.com';
--    3. Staff accounts:
--         update public.profiles set role = 'staff', branch_id = '<branch id>'
--         where email = 'cashier@example.com';
--
--  CONVENTIONS
--    * Money is INTEGER piasters (1 EGP = 100). 145 EGP is stored as 14500.
--    * Customer-facing text has _en and _ar columns.
--    * Orders copy names and prices at checkout; editing the menu or a promo
--      later never changes past orders.
--    * Clients never insert orders directly. They call place_order(), which
--      reads real prices from the database and checks every rule.
--
--  FUNCTIONS THE APP CALLS (supabase.rpc)
--    Public (anyone):  get_menu, place_order, validate_promo_code, track_order,
--                      is_branch_open
--    Customer:         update_order_status (cancel own pending order only)
--    Staff / admin:    update_order_status, mark_order_paid,
--                      set_menu_item_sold_out, set_addon_sold_out
--    Reports (staff: own branch, admin: all):
--                      report_daily_sales, report_branch_summary,
--                      report_top_items, report_top_addons,
--                      report_category_sales, report_hourly_sales,
--                      report_promo_usage, report_staff_activity
--
--  SAVED ADDRESSES
--    Customers read/add/edit/delete rows in customer_addresses directly
--    (supabase.from('customer_addresses')); security rules limit them to
--    their own. At checkout pass p_address_id, or type an address and
--    pass p_save_address = true to save it.
-- =====================================================================


-- =====================================================================
-- 1. TYPES
-- =====================================================================
CREATE TYPE public.user_role      AS ENUM ('customer', 'staff', 'admin');
CREATE TYPE public.order_type     AS ENUM ('pickup', 'delivery');
CREATE TYPE public.order_status   AS ENUM ('pending', 'confirmed', 'preparing', 'ready',
                                           'out_for_delivery', 'completed', 'cancelled');
CREATE TYPE public.payment_status AS ENUM ('unpaid', 'paid');
CREATE TYPE public.discount_type  AS ENUM ('percent', 'fixed');


-- =====================================================================
-- 2. UTILITY FUNCTIONS (needed by tables and triggers)
-- =====================================================================

-- Normalise phone numbers to E.164 (+201041093713).
-- Accepts 01041093713, 201041093713, +20 104 109 3713, 00201041093713.
-- Returns NULL if the result is not a plausible phone number.
CREATE OR REPLACE FUNCTION public.normalize_phone(p text)
RETURNS text
LANGUAGE plpgsql IMMUTABLE
SET search_path = public, pg_temp
AS $$
DECLARE d text;
BEGIN
  IF p IS NULL THEN RETURN NULL; END IF;
  d := regexp_replace(p, '[^0-9+]', '', 'g');
  IF d LIKE '00%' THEN d := '+' || substr(d, 3); END IF;
  IF d ~ '^0[0-9]{10}$' THEN            -- Egyptian local format 01xxxxxxxxx
    d := '+20' || substr(d, 2);
  ELSIF d !~ '^\+' THEN
    d := '+' || d;
  END IF;
  IF d !~ '^\+[0-9]{8,15}$' THEN RETURN NULL; END IF;
  RETURN d;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;


-- =====================================================================
-- 3. TABLES
-- =====================================================================

-- ---------------------------------------------------------------------
-- Branches
-- ---------------------------------------------------------------------
CREATE TABLE public.branches (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug                text NOT NULL UNIQUE,
  name_en             text NOT NULL,
  name_ar             text NOT NULL,
  address_en          text NOT NULL,
  address_ar          text NOT NULL,
  phone               text NOT NULL,
  timezone            text NOT NULL DEFAULT 'Africa/Cairo',
  opens_at            time NOT NULL DEFAULT '09:00',
  closes_at           time NOT NULL DEFAULT '02:00',   -- earlier than opens_at = after midnight;
                                                       -- equal to opens_at = open 24h
  accepts_pickup      boolean NOT NULL DEFAULT true,
  accepts_delivery    boolean NOT NULL DEFAULT true,
  delivery_fee        integer NOT NULL DEFAULT 0 CHECK (delivery_fee >= 0),
  min_delivery_order  integer NOT NULL DEFAULT 0 CHECK (min_delivery_order >= 0),
  is_active           boolean NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- Profiles: one row per Supabase Auth user (created automatically on
-- sign-up by the trigger in section 5). Login and passwords are handled
-- by Supabase Auth, not stored here.
-- ---------------------------------------------------------------------
CREATE TABLE public.profiles (
  id          uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name   text NOT NULL DEFAULT '',
  phone       text UNIQUE CHECK (phone ~ '^\+[0-9]{8,15}$'),
  email       text,
  role        public.user_role NOT NULL DEFAULT 'customer',
  branch_id   uuid REFERENCES public.branches(id) ON DELETE SET NULL,  -- staff's branch; null = all
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX profiles_role_idx ON public.profiles (role) WHERE role <> 'customer';

-- ---------------------------------------------------------------------
-- Saved delivery addresses (logged-in customers only, max 10 each).
-- One address per customer can be the default; the first one saved
-- becomes the default automatically.
-- ---------------------------------------------------------------------
CREATE TABLE public.customer_addresses (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  label         text NOT NULL DEFAULT 'Home',          -- 'Home', 'Work', 'Mom''s place'
  address       text NOT NULL CHECK (length(trim(address)) > 0),
  area          text,                                  -- 'Heliopolis', 'Nasr City'
  notes         text,                                  -- 'Building 4, 3rd floor, flat 12'
  latitude      numeric(9,6),
  longitude     numeric(9,6),
  is_default    boolean NOT NULL DEFAULT false,
  last_used_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX customer_addresses_user_idx ON public.customer_addresses (user_id, last_used_at DESC NULLS LAST);
CREATE UNIQUE INDEX customer_addresses_one_default ON public.customer_addresses (user_id) WHERE is_default;

-- ---------------------------------------------------------------------
-- Menu (shared by all branches)
-- ---------------------------------------------------------------------
CREATE TABLE public.menu_categories (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        text NOT NULL UNIQUE,
  name_en     text NOT NULL,
  name_ar     text NOT NULL,
  sort_order  integer NOT NULL DEFAULT 0,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.menu_items (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id     uuid NOT NULL REFERENCES public.menu_categories(id) ON DELETE RESTRICT,
  slug            text NOT NULL UNIQUE,
  name_en         text NOT NULL,
  name_ar         text NOT NULL,
  description_en  text,
  description_ar  text,
  price           integer NOT NULL CHECK (price >= 0),
  image_url       text,
  is_signature    boolean NOT NULL DEFAULT false,
  is_sold_out     boolean NOT NULL DEFAULT false,
  is_active       boolean NOT NULL DEFAULT true,
  sort_order      integer NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX menu_items_category_idx ON public.menu_items (category_id, sort_order);

-- ---------------------------------------------------------------------
-- Add-on groups
--   'Choose a side'  min 1, max 1  -> required, pick exactly one
--   'Extra sauce'    min 0, max 3  -> optional, pick up to three
-- ---------------------------------------------------------------------
CREATE TABLE public.addon_groups (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name_en     text NOT NULL,
  name_ar     text NOT NULL,
  min_select  smallint NOT NULL DEFAULT 0 CHECK (min_select >= 0),
  max_select  smallint NOT NULL DEFAULT 1 CHECK (max_select >= 1),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CHECK (max_select >= min_select)
);

CREATE TABLE public.addons (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id      uuid NOT NULL REFERENCES public.addon_groups(id) ON DELETE CASCADE,
  name_en       text NOT NULL,
  name_ar       text NOT NULL,
  price         integer NOT NULL DEFAULT 0 CHECK (price >= 0),          -- 0 = free choice
  max_quantity  smallint NOT NULL DEFAULT 1 CHECK (max_quantity > 0),   -- 2 = "double cheese"
  is_default    boolean NOT NULL DEFAULT false,                         -- pre-selected in the UI
  is_sold_out   boolean NOT NULL DEFAULT false,
  is_active     boolean NOT NULL DEFAULT true,
  sort_order    integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX addons_group_idx ON public.addons (group_id, sort_order);

CREATE TABLE public.menu_item_addon_groups (
  menu_item_id  uuid NOT NULL REFERENCES public.menu_items(id) ON DELETE CASCADE,
  group_id      uuid NOT NULL REFERENCES public.addon_groups(id) ON DELETE CASCADE,
  sort_order    integer NOT NULL DEFAULT 0,
  PRIMARY KEY (menu_item_id, group_id)
);
CREATE INDEX menu_item_addon_groups_group_idx ON public.menu_item_addon_groups (group_id);

-- ---------------------------------------------------------------------
-- Promo codes
-- ---------------------------------------------------------------------
CREATE TABLE public.promo_codes (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code             text NOT NULL,
  description      text,
  discount_type    public.discount_type NOT NULL,
  discount_value   integer NOT NULL CHECK (discount_value > 0),   -- percent (20) or piasters (5000)
  max_discount     integer CHECK (max_discount > 0),              -- cap for percent codes
  min_order_total  integer NOT NULL DEFAULT 0 CHECK (min_order_total >= 0),
  order_type       public.order_type,                             -- null = pickup and delivery
  branch_id        uuid REFERENCES public.branches(id) ON DELETE CASCADE,   -- null = all branches
  starts_at        timestamptz,
  ends_at          timestamptz,
  usage_limit      integer CHECK (usage_limit > 0),               -- null = unlimited
  per_user_limit   integer CHECK (per_user_limit > 0),            -- per phone number
  is_active        boolean NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CHECK (discount_type <> 'percent' OR discount_value <= 100),
  CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at)
);
CREATE UNIQUE INDEX promo_codes_code_uq ON public.promo_codes (upper(code));

-- ---------------------------------------------------------------------
-- Orders
-- ---------------------------------------------------------------------
CREATE SEQUENCE public.order_number_seq START 1000;

CREATE TABLE public.orders (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number      bigint NOT NULL UNIQUE DEFAULT nextval('public.order_number_seq'),
  branch_id         uuid NOT NULL REFERENCES public.branches(id) ON DELETE RESTRICT,
  user_id           uuid REFERENCES public.profiles(id) ON DELETE SET NULL,   -- null = guest
  type              public.order_type NOT NULL DEFAULT 'pickup',
  customer_name     text NOT NULL,
  customer_phone    text NOT NULL CHECK (customer_phone ~ '^\+[0-9]{8,15}$'),
  delivery_address  text,                                         -- snapshot
  delivery_notes    text,
  customer_address_id uuid REFERENCES public.customer_addresses(id) ON DELETE SET NULL,
  status            public.order_status   NOT NULL DEFAULT 'pending',
  payment_status    public.payment_status NOT NULL DEFAULT 'unpaid',
  paid_at           timestamptz,
  scheduled_for     timestamptz,                                  -- null = ASAP
  locale            text NOT NULL DEFAULT 'en' CHECK (locale IN ('en', 'ar')),
  promo_code_id     uuid REFERENCES public.promo_codes(id) ON DELETE SET NULL,
  promo_code        text,                                         -- snapshot of the code
  subtotal          integer NOT NULL DEFAULT 0,                   -- kept by trigger
  discount_total    integer NOT NULL DEFAULT 0 CHECK (discount_total >= 0),
  delivery_fee      integer NOT NULL DEFAULT 0 CHECK (delivery_fee >= 0),
  total             integer GENERATED ALWAYS AS
                      (GREATEST(subtotal - discount_total, 0) + delivery_fee) STORED,
  note              text,
  cancel_reason     text,
  handled_by        uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT orders_delivery_address_required CHECK (type <> 'delivery' OR delivery_address IS NOT NULL),
  CONSTRAINT orders_pickup_no_delivery_fee    CHECK (type = 'delivery' OR delivery_fee = 0),
  CONSTRAINT orders_out_for_delivery_only     CHECK (status <> 'out_for_delivery' OR type = 'delivery'),
  CONSTRAINT orders_paid_at_consistent        CHECK ((payment_status = 'paid') = (paid_at IS NOT NULL))
);
CREATE INDEX orders_branch_status_idx ON public.orders (branch_id, status, created_at DESC);
CREATE INDEX orders_user_idx          ON public.orders (user_id, created_at DESC);
CREATE INDEX orders_phone_idx         ON public.orders (customer_phone);
CREATE INDEX orders_promo_idx         ON public.orders (promo_code_id) WHERE promo_code_id IS NOT NULL;
CREATE INDEX orders_handled_by_idx    ON public.orders (handled_by);
CREATE INDEX orders_address_idx       ON public.orders (customer_address_id) WHERE customer_address_id IS NOT NULL;

CREATE TABLE public.order_items (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id      uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  menu_item_id  uuid REFERENCES public.menu_items(id) ON DELETE SET NULL,
  item_name     text NOT NULL,                               -- snapshot
  unit_price    integer NOT NULL CHECK (unit_price >= 0),     -- item price only
  addons_total  integer NOT NULL DEFAULT 0,                   -- per unit, kept by trigger
  quantity      smallint NOT NULL CHECK (quantity > 0),
  line_total    integer GENERATED ALWAYS AS ((unit_price + addons_total) * quantity) STORED,
  note          text
);
CREATE INDEX order_items_order_idx     ON public.order_items (order_id);
CREATE INDEX order_items_menu_item_idx ON public.order_items (menu_item_id);

CREATE TABLE public.order_item_addons (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_item_id  uuid NOT NULL REFERENCES public.order_items(id) ON DELETE CASCADE,
  addon_id       uuid REFERENCES public.addons(id) ON DELETE SET NULL,
  group_id       uuid REFERENCES public.addon_groups(id) ON DELETE SET NULL,
  group_name     text NOT NULL,                              -- snapshot: 'Choose a side'
  addon_name     text NOT NULL,                              -- snapshot: 'Fried chips'
  unit_price     integer NOT NULL CHECK (unit_price >= 0),
  quantity       smallint NOT NULL DEFAULT 1 CHECK (quantity > 0),
  UNIQUE (order_item_id, addon_id)
);
CREATE INDEX order_item_addons_addon_idx ON public.order_item_addons (addon_id);
CREATE INDEX order_item_addons_group_idx ON public.order_item_addons (group_id);

CREATE TABLE public.order_status_history (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id     uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  from_status  public.order_status,                          -- null for the first entry
  to_status    public.order_status NOT NULL,
  changed_by   uuid REFERENCES public.profiles(id) ON DELETE SET NULL,   -- null = guest / system
  note         text,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX order_status_history_order_idx   ON public.order_status_history (order_id, created_at);
CREATE INDEX order_status_history_changed_idx ON public.order_status_history (changed_by);


-- =====================================================================
-- 4. ROLE HELPERS (used by security policies and functions)
--    SECURITY DEFINER so they can read profiles without hitting RLS.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.app_role()
RETURNS public.user_role
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid() AND is_active;
$$;

CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(public.app_role() IN ('staff', 'admin'), false);
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(public.app_role() = 'admin', false);
$$;

-- Admins see every branch; staff see their own branch (or all if branch_id is null)
CREATE OR REPLACE FUNCTION public.can_access_branch(p_branch_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE((
    SELECT p.role = 'admin'
        OR (p.role = 'staff' AND (p.branch_id IS NULL OR p.branch_id = p_branch_id))
    FROM public.profiles p
    WHERE p.id = auth.uid() AND p.is_active
  ), false);
$$;


-- =====================================================================
-- 5. TRIGGERS
-- =====================================================================

-- 5.1 updated_at on every table that has it
CREATE TRIGGER branches_updated_at        BEFORE UPDATE ON public.branches        FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER profiles_updated_at        BEFORE UPDATE ON public.profiles        FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER menu_categories_updated_at BEFORE UPDATE ON public.menu_categories FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER menu_items_updated_at      BEFORE UPDATE ON public.menu_items      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER addon_groups_updated_at    BEFORE UPDATE ON public.addon_groups    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER addons_updated_at          BEFORE UPDATE ON public.addons          FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER promo_codes_updated_at     BEFORE UPDATE ON public.promo_codes     FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER orders_updated_at          BEFORE UPDATE ON public.orders          FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER customer_addresses_updated_at BEFORE UPDATE ON public.customer_addresses FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 5.1b Saved addresses: max 10 per customer, first one is the default,
--      choosing a new default clears the old one
CREATE OR REPLACE FUNCTION public.manage_customer_address()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF (SELECT count(*) FROM public.customer_addresses WHERE user_id = NEW.user_id) >= 10 THEN
      RAISE EXCEPTION 'You can save up to 10 addresses';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.customer_addresses WHERE user_id = NEW.user_id) THEN
      NEW.is_default := true;
    END IF;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'An address cannot be moved to another account';
  END IF;
  IF NEW.is_default THEN
    UPDATE public.customer_addresses
    SET is_default = false
    WHERE user_id = NEW.user_id AND id <> NEW.id AND is_default;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER customer_addresses_manage
  BEFORE INSERT OR UPDATE ON public.customer_addresses
  FOR EACH ROW EXECUTE FUNCTION public.manage_customer_address();

-- When the default address is deleted, the most recently used one becomes default
CREATE OR REPLACE FUNCTION public.reassign_default_address()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD.is_default THEN
    UPDATE public.customer_addresses
    SET is_default = true
    WHERE id = (SELECT id FROM public.customer_addresses
                WHERE user_id = OLD.user_id
                ORDER BY last_used_at DESC NULLS LAST, created_at DESC
                LIMIT 1);
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER customer_addresses_reassign_default
  AFTER DELETE ON public.customer_addresses
  FOR EACH ROW EXECUTE FUNCTION public.reassign_default_address();

-- 5.2 Create a profile automatically when someone signs up.
--     Pass name/phone at sign-up:
--       supabase.auth.signUp({ email, password,
--         options: { data: { full_name: 'Mohab', phone: '01012345678' } } })
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_phone text := public.normalize_phone(COALESCE(NEW.phone, NEW.raw_user_meta_data ->> 'phone'));
  v_name  text := COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.raw_user_meta_data ->> 'name', '');
BEGIN
  BEGIN
    INSERT INTO public.profiles (id, full_name, phone, email)
    VALUES (NEW.id, v_name, v_phone, NEW.email)
    ON CONFLICT (id) DO NOTHING;
  EXCEPTION WHEN unique_violation THEN
    -- phone already used by another profile: create the profile without it
    -- so sign-up never fails
    INSERT INTO public.profiles (id, full_name, phone, email)
    VALUES (NEW.id, v_name, NULL, NEW.email)
    ON CONFLICT (id) DO NOTHING;
  END;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 5.3 Customers and staff can edit their own name/phone, but only an admin
--     can change role, branch or active status. (The SQL Editor runs with no
--     logged-in user, so it is always allowed — that is how you create the
--     first admin.)
CREATE OR REPLACE FUNCTION public.protect_profile_fields()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.phone := public.normalize_phone(NEW.phone);
  IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
    IF NEW.role      IS DISTINCT FROM OLD.role
    OR NEW.branch_id IS DISTINCT FROM OLD.branch_id
    OR NEW.is_active IS DISTINCT FROM OLD.is_active
    OR NEW.id        IS DISTINCT FROM OLD.id THEN
      RAISE EXCEPTION 'Only an admin can change role, branch or account status';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER profiles_protect_fields
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_fields();

-- 5.4 order_items.addons_total = sum of the line's add-ons
CREATE OR REPLACE FUNCTION public.recalc_addons_total()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE v_item uuid := COALESCE(NEW.order_item_id, OLD.order_item_id);
BEGIN
  UPDATE public.order_items
  SET addons_total = COALESCE((SELECT SUM(unit_price * quantity)
                               FROM public.order_item_addons
                               WHERE order_item_id = v_item), 0)
  WHERE id = v_item;
  RETURN NULL;
END;
$$;

CREATE TRIGGER order_item_addons_recalc
  AFTER INSERT OR UPDATE OR DELETE ON public.order_item_addons
  FOR EACH ROW EXECUTE FUNCTION public.recalc_addons_total();

-- 5.5 orders.subtotal = sum of line totals
CREATE OR REPLACE FUNCTION public.recalc_order_subtotal()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE v_order uuid := COALESCE(NEW.order_id, OLD.order_id);
BEGIN
  UPDATE public.orders
  SET subtotal = COALESCE((SELECT SUM(line_total)
                           FROM public.order_items
                           WHERE order_id = v_order), 0)
  WHERE id = v_order;
  RETURN NULL;
END;
$$;

CREATE TRIGGER order_items_recalc
  AFTER INSERT OR UPDATE OR DELETE ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION public.recalc_order_subtotal();

-- 5.6 Write order history automatically on create and on every status change
CREATE OR REPLACE FUNCTION public.log_order_status()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.order_status_history (order_id, from_status, to_status, changed_by, note)
    VALUES (
      NEW.id,
      CASE WHEN TG_OP = 'UPDATE' THEN OLD.status END,
      NEW.status,
      (SELECT id FROM public.profiles WHERE id = auth.uid()),
      CASE WHEN NEW.status = 'cancelled' THEN NEW.cancel_reason END
    );
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER orders_log_status
  AFTER INSERT OR UPDATE OF status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.log_order_status();


-- =====================================================================
-- 6. APP FUNCTIONS (call with supabase.rpc('name', { ...params }))
-- =====================================================================

-- 6.1 Is the branch open at a given time? Handles closing after midnight.
CREATE OR REPLACE FUNCTION public.is_branch_open(p_branch_id uuid, p_at timestamptz DEFAULT now())
RETURNS boolean
LANGUAGE sql STABLE
SET search_path = public, pg_temp
AS $$
  SELECT CASE
           WHEN b.opens_at = b.closes_at THEN true
           WHEN b.opens_at <  b.closes_at THEN t >= b.opens_at AND t < b.closes_at
           ELSE t >= b.opens_at OR t < b.closes_at
         END
  FROM public.branches b,
       LATERAL (SELECT (p_at AT TIME ZONE b.timezone)::time AS t) x
  WHERE b.id = p_branch_id AND b.is_active;
$$;

-- 6.2 Whole menu in one call: categories -> items -> add-on groups -> add-ons
CREATE OR REPLACE FUNCTION public.get_menu()
RETURNS jsonb
LANGUAGE sql STABLE
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', c.id, 'slug', c.slug, 'name_en', c.name_en, 'name_ar', c.name_ar,
      'items', (
        SELECT COALESCE(jsonb_agg(
          jsonb_build_object(
            'id', i.id, 'slug', i.slug,
            'name_en', i.name_en, 'name_ar', i.name_ar,
            'description_en', i.description_en, 'description_ar', i.description_ar,
            'price', i.price, 'image_url', i.image_url,
            'is_signature', i.is_signature, 'is_sold_out', i.is_sold_out,
            'addon_groups', (
              SELECT COALESCE(jsonb_agg(
                jsonb_build_object(
                  'id', g.id, 'name_en', g.name_en, 'name_ar', g.name_ar,
                  'min_select', g.min_select, 'max_select', g.max_select,
                  'addons', (
                    SELECT COALESCE(jsonb_agg(
                      jsonb_build_object(
                        'id', a.id, 'name_en', a.name_en, 'name_ar', a.name_ar,
                        'price', a.price, 'max_quantity', a.max_quantity,
                        'is_default', a.is_default, 'is_sold_out', a.is_sold_out
                      ) ORDER BY a.sort_order, a.name_en), '[]'::jsonb)
                    FROM public.addons a
                    WHERE a.group_id = g.id AND a.is_active
                  )
                ) ORDER BY mg.sort_order), '[]'::jsonb)
              FROM public.menu_item_addon_groups mg
              JOIN public.addon_groups g ON g.id = mg.group_id
              WHERE mg.menu_item_id = i.id
            )
          ) ORDER BY i.sort_order, i.name_en), '[]'::jsonb)
        FROM public.menu_items i
        WHERE i.category_id = c.id AND i.is_active
      )
    ) ORDER BY c.sort_order, c.name_en), '[]'::jsonb)
  FROM public.menu_categories c
  WHERE c.is_active;
$$;

-- 6.3 Check a promo code and work out the discount.
--     The app can call it for the "Apply" button; place_order calls it again.
CREATE OR REPLACE FUNCTION public.validate_promo_code(
  p_code       text,
  p_branch_id  uuid,
  p_type       public.order_type,
  p_subtotal   integer,
  p_phone      text DEFAULT NULL
)
RETURNS TABLE (promo_id uuid, promo_code text, discount_amount integer)
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

  IF v.discount_type = 'percent' THEN
    v_disc := floor(p_subtotal * v.discount_value / 100.0);
    IF v.max_discount IS NOT NULL THEN v_disc := LEAST(v_disc, v.max_discount); END IF;
  ELSE
    v_disc := LEAST(v.discount_value, p_subtotal);
  END IF;

  RETURN QUERY SELECT v.id, v.code, v_disc;
END;
$$;

-- 6.4 Place an order. The ONLY way orders are created.
--     p_items example:
--     [
--       { "menu_item_id": "…", "quantity": 2, "note": "no onions",
--         "addons": [ { "addon_id": "…", "quantity": 1 } ] }
--     ]
--     Returns { order_id, order_number, subtotal, discount_total, delivery_fee, total }
CREATE OR REPLACE FUNCTION public.place_order(
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
  p_address_id        uuid        DEFAULT NULL,    -- use a saved address (delivery)
  p_save_address      boolean     DEFAULT false,   -- save the typed address to the account
  p_address_label     text        DEFAULT NULL     -- label for the saved address
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
  v_locale      text := CASE WHEN p_locale = 'ar' THEN 'ar' ELSE 'en' END;
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
  -- ---- customer details
  IF COALESCE(trim(p_customer_name), '') = '' THEN
    RAISE EXCEPTION 'Please enter your name';
  END IF;
  IF v_phone IS NULL THEN
    RAISE EXCEPTION 'Please enter a valid phone number';
  END IF;

  -- ---- cart
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Your cart is empty';
  END IF;
  IF jsonb_array_length(p_items) > 50 THEN
    RAISE EXCEPTION 'Too many items in one order';
  END IF;

  -- ---- branch, order type, time
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
  -- ---- delivery address: a saved one, or typed in (optionally saved)
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

  -- ---- logged-in customer (null for guests)
  SELECT id INTO v_user FROM public.profiles WHERE id = auth.uid();

  -- ---- create the order
  INSERT INTO public.orders (branch_id, user_id, type, customer_name, customer_phone,
                             delivery_address, delivery_notes, customer_address_id,
                             scheduled_for, note, delivery_fee, locale)
  VALUES (p_branch_id, v_user, p_type, trim(p_customer_name), v_phone,
          CASE WHEN p_type = 'delivery' THEN v_address END,
          CASE WHEN p_type = 'delivery' THEN v_addr_notes END,
          CASE WHEN p_type = 'delivery' THEN v_address_id END,
          p_scheduled_for, NULLIF(trim(p_note), ''),
          CASE WHEN p_type = 'delivery' THEN v_branch.delivery_fee ELSE 0 END,
          v_locale)
  RETURNING id INTO v_order_id;

  -- ---- lines
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

    -- add-ons on this line
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

    -- every group on this item: did the customer pick enough / not too many?
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

  -- ---- totals (subtotal is kept by triggers)
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

  SELECT jsonb_build_object(
           'order_id', o.id, 'order_number', o.order_number, 'status', o.status,
           'subtotal', o.subtotal, 'discount_total', o.discount_total,
           'delivery_fee', o.delivery_fee, 'total', o.total)
  INTO v_result
  FROM public.orders o WHERE o.id = v_order_id;

  RETURN v_result;
END;
$$;

-- 6.5 Move an order through its life:
--     pending → confirmed → preparing → ready → completed           (pickup)
--     pending → confirmed → preparing → ready → out_for_delivery → completed  (delivery)
--     any step before completed → cancelled
--     Staff: any allowed move at their branch. Customers: cancel their own
--     order while it is still pending. Completing an order marks it paid
--     (cash is collected on handover).
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

-- 6.6 Record that the cash was collected (e.g. paid at the counter before handover)
CREATE OR REPLACE FUNCTION public.mark_order_paid(p_order_id uuid)
RETURNS public.orders
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v public.orders%ROWTYPE;
BEGIN
  SELECT * INTO v FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;
  IF NOT (public.is_staff() AND public.can_access_branch(v.branch_id)) THEN
    RAISE EXCEPTION 'Only staff can mark orders as paid';
  END IF;
  IF v.status = 'cancelled' THEN
    RAISE EXCEPTION 'This order was cancelled';
  END IF;
  IF v.payment_status = 'paid' THEN
    RETURN v;
  END IF;

  UPDATE public.orders
  SET payment_status = 'paid', paid_at = now(), handled_by = auth.uid()
  WHERE id = p_order_id
  RETURNING * INTO v;
  RETURN v;
END;
$$;

-- 6.7 Staff switch for the "Sold out" badge (staff cannot edit other menu fields)
CREATE OR REPLACE FUNCTION public.set_menu_item_sold_out(p_menu_item_id uuid, p_sold_out boolean)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.is_staff() THEN
    RAISE EXCEPTION 'Only staff can change availability';
  END IF;
  UPDATE public.menu_items SET is_sold_out = p_sold_out WHERE id = p_menu_item_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Menu item not found'; END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_addon_sold_out(p_addon_id uuid, p_sold_out boolean)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.is_staff() THEN
    RAISE EXCEPTION 'Only staff can change availability';
  END IF;
  UPDATE public.addons SET is_sold_out = p_sold_out WHERE id = p_addon_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Add-on not found'; END IF;
END;
$$;

-- 6.8 Order tracking page for guests: order number + phone number
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
    'order_number',   v.order_number,
    'status',         v.status,
    'type',           v.type,
    'payment_status', v.payment_status,
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


-- =====================================================================
-- 6B. SALES REPORTS (staff see their own branch, admins see any/all)
--
--   Business day: the restaurant closes at 2 AM, so an order placed at
--   1:30 AM belongs to the PREVIOUS day's sales. A business day runs from
--   05:00 to 04:59 local time (change business_day_start() if needed).
--
--   Revenue counts COMPLETED orders only. Cancelled orders are counted
--   separately so you can see how many were lost.
--
--   All report functions take:
--     p_from, p_to  : business dates, inclusive (max 366 days)
--     p_branch_id   : a branch, or null = all branches the user may see
--
--   Money columns are piasters, like everywhere else.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.business_day_start()
RETURNS interval
LANGUAGE sql IMMUTABLE
SET search_path = public, pg_temp
AS $$ SELECT interval '5 hours' $$;

CREATE OR REPLACE FUNCTION public.business_date(p_at timestamptz, p_timezone text)
RETURNS date
LANGUAGE sql IMMUTABLE
SET search_path = public, pg_temp
AS $$ SELECT ((p_at AT TIME ZONE p_timezone) - public.business_day_start())::date $$;

-- Who may see which branch's numbers. Returns the branch to filter by
-- (null = all branches) or raises an error.
CREATE OR REPLACE FUNCTION public.report_scope(p_branch_id uuid, p_from date, p_to date)
RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v public.profiles%ROWTYPE;
BEGIN
  IF p_from IS NULL OR p_to IS NULL OR p_to < p_from THEN
    RAISE EXCEPTION 'Choose a valid date range';
  END IF;
  IF p_to - p_from > 366 THEN
    RAISE EXCEPTION 'Reports cover at most one year at a time';
  END IF;

  SELECT * INTO v FROM public.profiles WHERE id = auth.uid() AND is_active;
  IF NOT FOUND OR v.role NOT IN ('staff', 'admin') THEN
    RAISE EXCEPTION 'Only staff can view reports';
  END IF;
  IF v.role = 'admin' OR v.branch_id IS NULL THEN
    RETURN p_branch_id;
  END IF;
  IF p_branch_id IS NOT NULL AND p_branch_id <> v.branch_id THEN
    RAISE EXCEPTION 'You can only view reports for your own branch';
  END IF;
  RETURN v.branch_id;
END;
$$;

-- R1. Day-by-day sales
CREATE OR REPLACE FUNCTION public.report_daily_sales(p_from date, p_to date, p_branch_id uuid DEFAULT NULL)
RETURNS TABLE (
  business_day      date,
  orders_placed     bigint,
  orders_completed  bigint,
  orders_cancelled  bigint,
  pickup_orders     bigint,
  delivery_orders   bigint,
  gross_sales       bigint,   -- items + add-ons, before discount
  discounts         bigint,
  delivery_fees     bigint,
  net_revenue       bigint,   -- what was actually collected
  avg_order_value   bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_scope uuid := public.report_scope(p_branch_id, p_from, p_to);
BEGIN
  RETURN QUERY
  WITH days AS (
    SELECT d::date AS business_day FROM generate_series(p_from, p_to, interval '1 day') d
  ), o AS (
    SELECT public.business_date(o.created_at, b.timezone) AS business_day, o.*
    FROM public.orders o JOIN public.branches b ON b.id = o.branch_id
    WHERE (v_scope IS NULL OR o.branch_id = v_scope)
      AND public.business_date(o.created_at, b.timezone) BETWEEN p_from AND p_to
  )
  SELECT d.business_day,
         count(o.id),
         count(o.id) FILTER (WHERE o.status = 'completed'),
         count(o.id) FILTER (WHERE o.status = 'cancelled'),
         count(o.id) FILTER (WHERE o.type = 'pickup'   AND o.status <> 'cancelled'),
         count(o.id) FILTER (WHERE o.type = 'delivery' AND o.status <> 'cancelled'),
         COALESCE(sum(o.subtotal)       FILTER (WHERE o.status = 'completed'), 0)::bigint,
         COALESCE(sum(o.discount_total) FILTER (WHERE o.status = 'completed'), 0)::bigint,
         COALESCE(sum(o.delivery_fee)   FILTER (WHERE o.status = 'completed'), 0)::bigint,
         COALESCE(sum(o.total)          FILTER (WHERE o.status = 'completed'), 0)::bigint,
         COALESCE(round(avg(o.total)    FILTER (WHERE o.status = 'completed')), 0)::bigint
  FROM days d
  LEFT JOIN o ON o.business_day = d.business_day
  GROUP BY d.business_day
  ORDER BY d.business_day;
END;
$$;

-- R2. Totals for the whole period, one row per branch (for a dashboard header)
CREATE OR REPLACE FUNCTION public.report_branch_summary(p_from date, p_to date, p_branch_id uuid DEFAULT NULL)
RETURNS TABLE (
  branch_id         uuid,
  branch_name       text,
  orders_placed     bigint,
  orders_completed  bigint,
  orders_cancelled  bigint,
  cancel_rate_pct   numeric,
  gross_sales       bigint,
  discounts         bigint,
  delivery_fees     bigint,
  net_revenue       bigint,
  avg_order_value   bigint,
  unique_customers  bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_scope uuid := public.report_scope(p_branch_id, p_from, p_to);
BEGIN
  RETURN QUERY
  SELECT b.id, b.name_en,
         count(o.id),
         count(o.id) FILTER (WHERE o.status = 'completed'),
         count(o.id) FILTER (WHERE o.status = 'cancelled'),
         CASE WHEN count(o.id) = 0 THEN 0
              ELSE round(100.0 * count(o.id) FILTER (WHERE o.status = 'cancelled') / count(o.id), 1) END,
         COALESCE(sum(o.subtotal)       FILTER (WHERE o.status = 'completed'), 0)::bigint,
         COALESCE(sum(o.discount_total) FILTER (WHERE o.status = 'completed'), 0)::bigint,
         COALESCE(sum(o.delivery_fee)   FILTER (WHERE o.status = 'completed'), 0)::bigint,
         COALESCE(sum(o.total)          FILTER (WHERE o.status = 'completed'), 0)::bigint,
         COALESCE(round(avg(o.total)    FILTER (WHERE o.status = 'completed')), 0)::bigint,
         count(DISTINCT o.customer_phone) FILTER (WHERE o.status = 'completed')
  FROM public.branches b
  LEFT JOIN public.orders o
    ON o.branch_id = b.id
   AND public.business_date(o.created_at, b.timezone) BETWEEN p_from AND p_to
  WHERE (v_scope IS NULL OR b.id = v_scope)
  GROUP BY b.id, b.name_en
  ORDER BY b.name_en;
END;
$$;

-- R3. Best-selling menu items (completed orders)
CREATE OR REPLACE FUNCTION public.report_top_items(p_from date, p_to date, p_branch_id uuid DEFAULT NULL, p_limit integer DEFAULT 20)
RETURNS TABLE (
  menu_item_id   uuid,
  item_name      text,
  category_name  text,
  quantity_sold  bigint,
  order_count    bigint,
  revenue        bigint    -- line totals incl. add-ons, before order discounts
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_scope uuid := public.report_scope(p_branch_id, p_from, p_to);
BEGIN
  RETURN QUERY
  SELECT oi.menu_item_id,
         COALESCE(mi.name_en, max(oi.item_name)),
         c.name_en,
         sum(oi.quantity)::bigint,
         count(DISTINCT o.id),
         sum(oi.line_total)::bigint
  FROM public.orders o
  JOIN public.branches b      ON b.id = o.branch_id
  JOIN public.order_items oi  ON oi.order_id = o.id
  LEFT JOIN public.menu_items mi      ON mi.id = oi.menu_item_id
  LEFT JOIN public.menu_categories c  ON c.id = mi.category_id
  WHERE o.status = 'completed'
    AND (v_scope IS NULL OR o.branch_id = v_scope)
    AND public.business_date(o.created_at, b.timezone) BETWEEN p_from AND p_to
  GROUP BY oi.menu_item_id, mi.name_en, c.name_en
  ORDER BY sum(oi.quantity) DESC, sum(oi.line_total) DESC
  LIMIT GREATEST(COALESCE(p_limit, 20), 1);
END;
$$;

-- R4. Most popular add-ons (extra sauces, sides chosen)
CREATE OR REPLACE FUNCTION public.report_top_addons(p_from date, p_to date, p_branch_id uuid DEFAULT NULL, p_limit integer DEFAULT 20)
RETURNS TABLE (
  addon_id       uuid,
  addon_name     text,
  group_name     text,
  quantity_sold  bigint,
  revenue        bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_scope uuid := public.report_scope(p_branch_id, p_from, p_to);
BEGIN
  RETURN QUERY
  SELECT oia.addon_id,
         COALESCE(a.name_en, max(oia.addon_name)),
         COALESCE(g.name_en, max(oia.group_name)),
         sum(oia.quantity * oi.quantity)::bigint,
         sum(oia.unit_price * oia.quantity * oi.quantity)::bigint
  FROM public.orders o
  JOIN public.branches b            ON b.id = o.branch_id
  JOIN public.order_items oi        ON oi.order_id = o.id
  JOIN public.order_item_addons oia ON oia.order_item_id = oi.id
  LEFT JOIN public.addons a         ON a.id = oia.addon_id
  LEFT JOIN public.addon_groups g   ON g.id = oia.group_id
  WHERE o.status = 'completed'
    AND (v_scope IS NULL OR o.branch_id = v_scope)
    AND public.business_date(o.created_at, b.timezone) BETWEEN p_from AND p_to
  GROUP BY oia.addon_id, a.name_en, g.name_en
  ORDER BY 4 DESC, 5 DESC
  LIMIT GREATEST(COALESCE(p_limit, 20), 1);
END;
$$;

-- R5. Sales by category
CREATE OR REPLACE FUNCTION public.report_category_sales(p_from date, p_to date, p_branch_id uuid DEFAULT NULL)
RETURNS TABLE (
  category_id    uuid,
  category_name  text,
  quantity_sold  bigint,
  revenue        bigint,
  share_pct      numeric
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_scope uuid := public.report_scope(p_branch_id, p_from, p_to);
BEGIN
  RETURN QUERY
  WITH lines AS (
    SELECT c.id AS cat_id, COALESCE(c.name_en, 'Removed items') AS cat_name, oi.quantity, oi.line_total
    FROM public.orders o
    JOIN public.branches b      ON b.id = o.branch_id
    JOIN public.order_items oi  ON oi.order_id = o.id
    LEFT JOIN public.menu_items mi     ON mi.id = oi.menu_item_id
    LEFT JOIN public.menu_categories c ON c.id = mi.category_id
    WHERE o.status = 'completed'
      AND (v_scope IS NULL OR o.branch_id = v_scope)
      AND public.business_date(o.created_at, b.timezone) BETWEEN p_from AND p_to
  )
  SELECT cat_id, cat_name,
         sum(quantity)::bigint,
         sum(line_total)::bigint,
         round(100.0 * sum(line_total) / NULLIF(sum(sum(line_total)) OVER (), 0), 1)
  FROM lines
  GROUP BY cat_id, cat_name
  ORDER BY 4 DESC;
END;
$$;

-- R6. Busiest hours (local time) — for staffing
CREATE OR REPLACE FUNCTION public.report_hourly_sales(p_from date, p_to date, p_branch_id uuid DEFAULT NULL)
RETURNS TABLE (
  hour_of_day       integer,   -- 0–23, local time
  orders_completed  bigint,
  net_revenue       bigint,
  avg_per_day       numeric    -- completed orders per day in that hour
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_scope uuid    := public.report_scope(p_branch_id, p_from, p_to);
  v_days  integer := (p_to - p_from) + 1;
BEGIN
  RETURN QUERY
  WITH hours AS (SELECT generate_series(0, 23) AS h),
  o AS (
    SELECT extract(hour FROM o.created_at AT TIME ZONE b.timezone)::integer AS h, o.total
    FROM public.orders o JOIN public.branches b ON b.id = o.branch_id
    WHERE o.status = 'completed'
      AND (v_scope IS NULL OR o.branch_id = v_scope)
      AND public.business_date(o.created_at, b.timezone) BETWEEN p_from AND p_to
  )
  SELECT hours.h, count(o.h), COALESCE(sum(o.total), 0)::bigint, round(count(o.h)::numeric / v_days, 2)
  FROM hours LEFT JOIN o ON o.h = hours.h
  GROUP BY hours.h
  ORDER BY hours.h;
END;
$$;

-- R7. Promo code performance
CREATE OR REPLACE FUNCTION public.report_promo_usage(p_from date, p_to date, p_branch_id uuid DEFAULT NULL)
RETURNS TABLE (
  promo_code_id    uuid,
  code             text,
  times_used       bigint,
  unique_customers bigint,
  discount_given   bigint,
  net_revenue      bigint     -- revenue from orders that used the code
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_scope uuid := public.report_scope(p_branch_id, p_from, p_to);
BEGIN
  RETURN QUERY
  SELECT o.promo_code_id,
         COALESCE(pc.code, max(o.promo_code)),
         count(*),
         count(DISTINCT o.customer_phone),
         sum(o.discount_total)::bigint,
         sum(o.total)::bigint
  FROM public.orders o
  JOIN public.branches b ON b.id = o.branch_id
  LEFT JOIN public.promo_codes pc ON pc.id = o.promo_code_id
  WHERE o.status = 'completed'
    AND o.promo_code IS NOT NULL
    AND (v_scope IS NULL OR o.branch_id = v_scope)
    AND public.business_date(o.created_at, b.timezone) BETWEEN p_from AND p_to
  GROUP BY o.promo_code_id, pc.code
  ORDER BY 3 DESC;
END;
$$;

-- R8. Staff activity: orders each staff member handled, cash they collected
CREATE OR REPLACE FUNCTION public.report_staff_activity(p_from date, p_to date, p_branch_id uuid DEFAULT NULL)
RETURNS TABLE (
  staff_id          uuid,
  staff_name        text,
  orders_completed  bigint,
  orders_cancelled  bigint,
  cash_collected    bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_scope uuid := public.report_scope(p_branch_id, p_from, p_to);
BEGIN
  RETURN QUERY
  SELECT p.id, p.full_name,
         count(*) FILTER (WHERE o.status = 'completed'),
         count(*) FILTER (WHERE o.status = 'cancelled'),
         COALESCE(sum(o.total) FILTER (WHERE o.payment_status = 'paid'), 0)::bigint
  FROM public.orders o
  JOIN public.branches b ON b.id = o.branch_id
  JOIN public.profiles p ON p.id = o.handled_by
  WHERE (v_scope IS NULL OR o.branch_id = v_scope)
    AND public.business_date(o.created_at, b.timezone) BETWEEN p_from AND p_to
  GROUP BY p.id, p.full_name
  ORDER BY 5 DESC;
END;
$$;


-- =====================================================================
-- 7. ROW LEVEL SECURITY
--    Public: read active menu and branches.
--    Customers: read/edit own profile, read own orders.
--    Staff: read orders of their branch, read profiles and promo codes.
--    Admins: full control of menu, branches, promo codes, profiles.
--    Nobody inserts/updates orders directly — only through the functions.
-- =====================================================================
ALTER TABLE public.branches               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_categories        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_items             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.addon_groups           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.addons                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_item_addon_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promo_codes            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_item_addons      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_status_history   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_addresses     ENABLE ROW LEVEL SECURITY;

-- ---- saved addresses: each customer manages only their own
CREATE POLICY "Customers view own addresses" ON public.customer_addresses
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
CREATE POLICY "Customers add own addresses" ON public.customer_addresses
  FOR INSERT TO authenticated WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY "Customers edit own addresses" ON public.customer_addresses
  FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY "Customers delete own addresses" ON public.customer_addresses
  FOR DELETE TO authenticated USING (user_id = (SELECT auth.uid()));

-- ---- branches
CREATE POLICY "Anyone can view active branches" ON public.branches
  FOR SELECT TO anon, authenticated
  USING (is_active OR (SELECT public.is_staff()));
CREATE POLICY "Admins manage branches" ON public.branches
  FOR ALL TO authenticated
  USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));

-- ---- profiles
CREATE POLICY "Users view own profile, staff view all" ON public.profiles
  FOR SELECT TO authenticated
  USING (id = (SELECT auth.uid()) OR (SELECT public.is_staff()));
CREATE POLICY "Users update own profile" ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = (SELECT auth.uid())) WITH CHECK (id = (SELECT auth.uid()));
CREATE POLICY "Admins manage profiles" ON public.profiles
  FOR ALL TO authenticated
  USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));

-- ---- menu (public read, admin write)
CREATE POLICY "Anyone can view active categories" ON public.menu_categories
  FOR SELECT TO anon, authenticated
  USING (is_active OR (SELECT public.is_staff()));
CREATE POLICY "Admins manage categories" ON public.menu_categories
  FOR ALL TO authenticated
  USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));

CREATE POLICY "Anyone can view active menu items" ON public.menu_items
  FOR SELECT TO anon, authenticated
  USING (is_active OR (SELECT public.is_staff()));
CREATE POLICY "Admins manage menu items" ON public.menu_items
  FOR ALL TO authenticated
  USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));

CREATE POLICY "Anyone can view add-on groups" ON public.addon_groups
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Admins manage add-on groups" ON public.addon_groups
  FOR ALL TO authenticated
  USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));

CREATE POLICY "Anyone can view active add-ons" ON public.addons
  FOR SELECT TO anon, authenticated
  USING (is_active OR (SELECT public.is_staff()));
CREATE POLICY "Admins manage add-ons" ON public.addons
  FOR ALL TO authenticated
  USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));

CREATE POLICY "Anyone can view item add-on groups" ON public.menu_item_addon_groups
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Admins manage item add-on groups" ON public.menu_item_addon_groups
  FOR ALL TO authenticated
  USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));

-- ---- promo codes (not publicly listable; checked through validate_promo_code)
CREATE POLICY "Staff view promo codes" ON public.promo_codes
  FOR SELECT TO authenticated USING ((SELECT public.is_staff()));
CREATE POLICY "Admins manage promo codes" ON public.promo_codes
  FOR ALL TO authenticated
  USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));

-- ---- orders and their children (read only; writes go through functions)
CREATE POLICY "Customers view own orders, staff view branch orders" ON public.orders
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) OR public.can_access_branch(branch_id));

CREATE POLICY "View items of visible orders" ON public.order_items
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id));

CREATE POLICY "View add-ons of visible order items" ON public.order_item_addons
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.order_items oi WHERE oi.id = order_item_id));

CREATE POLICY "View history of visible orders" ON public.order_status_history
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id));


-- =====================================================================
-- 8. PERMISSIONS
-- =====================================================================
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT ON public.branches, public.menu_categories, public.menu_items,
                public.addon_groups, public.addons, public.menu_item_addon_groups
  TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;

-- Public functions
GRANT EXECUTE ON FUNCTION public.get_menu()                                                 TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_branch_open(uuid, timestamptz)                          TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.validate_promo_code(text, uuid, public.order_type, integer, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.place_order(uuid, public.order_type, text, text, jsonb, text, text, text, timestamptz, text, text, uuid, boolean, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.track_order(bigint, text)                                  TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.normalize_phone(text)                                      TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.app_role(), public.is_staff(), public.is_admin(),
                          public.can_access_branch(uuid)                                    TO anon, authenticated;

-- Logged-in only
REVOKE EXECUTE ON FUNCTION public.update_order_status(uuid, public.order_status, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.mark_order_paid(uuid)                                FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.set_menu_item_sold_out(uuid, boolean)                FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.set_addon_sold_out(uuid, boolean)                    FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.update_order_status(uuid, public.order_status, text) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.mark_order_paid(uuid)                                TO authenticated;
GRANT  EXECUTE ON FUNCTION public.set_menu_item_sold_out(uuid, boolean)                TO authenticated;
GRANT  EXECUTE ON FUNCTION public.set_addon_sold_out(uuid, boolean)                    TO authenticated;

-- Reports: logged-in staff/admin only (checked inside report_scope)
REVOKE EXECUTE ON FUNCTION public.report_scope(uuid, date, date)                         FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.report_daily_sales(date, date, uuid)                   FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.report_branch_summary(date, date, uuid)                FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.report_top_items(date, date, uuid, integer)            FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.report_top_addons(date, date, uuid, integer)           FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.report_category_sales(date, date, uuid)                FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.report_hourly_sales(date, date, uuid)                  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.report_promo_usage(date, date, uuid)                   FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.report_staff_activity(date, date, uuid)                FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.report_daily_sales(date, date, uuid),
                          public.report_branch_summary(date, date, uuid),
                          public.report_top_items(date, date, uuid, integer),
                          public.report_top_addons(date, date, uuid, integer),
                          public.report_category_sales(date, date, uuid),
                          public.report_hourly_sales(date, date, uuid),
                          public.report_promo_usage(date, date, uuid),
                          public.report_staff_activity(date, date, uuid)              TO authenticated;

-- Trigger-only functions: nobody calls these directly
REVOKE EXECUTE ON FUNCTION public.manage_customer_address()  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.reassign_default_address() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user()        FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.protect_profile_fields() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_order_status()       FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recalc_addons_total()    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recalc_order_subtotal()  FROM PUBLIC, anon, authenticated;


-- =====================================================================
-- 9. REALTIME — kitchen/cashier screen gets new orders and status changes
--    live (security policies still apply to what each user receives)
-- =====================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.orders, public.order_status_history;
  END IF;
END $$;


-- =====================================================================
-- 10. STORAGE — public bucket for menu photos; only admins upload
-- =====================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'storage' AND table_name = 'buckets') THEN

    INSERT INTO storage.buckets (id, name, public)
    VALUES ('menu-images', 'menu-images', true)
    ON CONFLICT (id) DO NOTHING;

    CREATE POLICY "Admins upload menu images" ON storage.objects
      FOR INSERT TO authenticated
      WITH CHECK (bucket_id = 'menu-images' AND public.is_admin());
    CREATE POLICY "Admins update menu images" ON storage.objects
      FOR UPDATE TO authenticated
      USING (bucket_id = 'menu-images' AND public.is_admin());
    CREATE POLICY "Admins delete menu images" ON storage.objects
      FOR DELETE TO authenticated
      USING (bucket_id = 'menu-images' AND public.is_admin());
  END IF;
END $$;


-- =====================================================================
-- 11. STARTER DATA (safe to delete this section if you will add your own)
-- =====================================================================
INSERT INTO public.branches (slug, name_en, name_ar, address_en, address_ar, phone, delivery_fee)
VALUES ('meraki-salah-salem',
        'Meraki Complex – Salah Salem', 'ميراكي كومبلكس – صلاح سالم',
        'Meraki Complex, Air Force House, El Golf, Salah Salem, Cairo',
        'ميراكي كومبلكس، دار القوات الجوية، الجولف، صلاح سالم، القاهرة',
        '+201041093713', 3000);

INSERT INTO public.menu_categories (slug, name_en, name_ar, sort_order) VALUES
  ('side-bites',         'Side Bites',            'مقبلات',                1),
  ('fresh-sides',        'Fresh Sides',           'سلطات',                 2),
  ('morning-mood',       'Morning Mood',          'فطار',                  3),
  ('all-day-panuozzo',   'All Day Panuozzo',      'بانوتزو طول اليوم',     4),
  ('sauces',             'Sauces',                'صوصات',                 5),
  ('sweet-panuozzo',     'Sweet Panuozzo & More', 'بانوتزو حلو والمزيد',   6),
  ('signatures',         'Signatures',            'مشروبات مميزة',         7),
  ('refreshers',         'Refreshers',            'مشروبات منعشة',         8),
  ('iced-tea',           'Iced Tea',              'شاي مثلج',              9),
  ('hot-drinks',         'Hot Drinks',            'مشروبات ساخنة',        10),
  ('frappe-iced-coffee', 'Frappe & Iced Coffee',  'فرابيه وقهوة مثلجة',   11),
  ('smoothies',          'Smoothies',             'سموذي',                12);

INSERT INTO public.addon_groups (name_en, name_ar, min_select, max_select) VALUES
  ('Choose a side', 'اختر الطبق الجانبي', 1, 1),
  ('Extra sauce',   'صوص إضافي',          0, 3);

INSERT INTO public.addons (group_id, name_en, name_ar, price, is_default, sort_order)
SELECT g.id, x.name_en, x.name_ar, x.price, x.is_default, x.sort_order
FROM public.addon_groups g,
     (VALUES ('Fried chips', 'بطاطس مقلية', 0, true,  1),
             ('Salad',       'سلطة',        0, false, 2)) AS x(name_en, name_ar, price, is_default, sort_order)
WHERE g.name_en = 'Choose a side';

INSERT INTO public.addons (group_id, name_en, name_ar, price, sort_order)
SELECT g.id, x.name_en, x.name_ar, x.price, x.sort_order
FROM public.addon_groups g,
     (VALUES ('Pesto mayo',      'مايونيز بيستو',   5500, 1),
             ('Cheddar sauce',   'صوص شيدر',        5500, 2),
             ('Truffle mayo',    'مايونيز ترافل',   5500, 3),
             ('Spicy mayo',      'مايونيز حار',     4500, 4),
             ('Smoked sauce',    'صوص مدخن',        4500, 5),
             ('Garlic parmesan', 'ثوم وبارميزان',   4500, 6)) AS x(name_en, name_ar, price, sort_order)
WHERE g.name_en = 'Extra sauce';

INSERT INTO public.menu_items (category_id, slug, name_en, name_ar, description_en, price, is_signature, sort_order)
SELECT c.id, x.slug, x.name_en, x.name_ar, x.description_en, x.price, x.is_signature, x.sort_order
FROM (VALUES
  ('side-bites',       'fried-truffle-buffalo-balls', 'Fried Truffle Buffalo Balls', 'كرات جبنة بافلو مقلية بالترافل',
     '5 fried buffalo cheese balls with truffle mayo sauce, parmesan cheese and parsley.', 14500, true,  1),
  ('morning-mood',     'the-comfort',                 'The Comfort',                 'ذا كومفورت',
     'A golden fried sourdough panuozzo filled with rich marinara, fresh mozzarella, basil, and parmesan, served with salad or fried chips.', 17900, false, 1),
  ('all-day-panuozzo', 'chicken-cream-alfredo',       'Chicken Cream Alfredo',       'تشيكن كريم ألفريدو',
     'Grilled chicken breast, fresh rocca, and parmesan with creamy alfredo mushroom sauce in a sourdough panuozzo.', 25000, false, 1),
  ('all-day-panuozzo', 'hot-honey-pepperoni',         'Hot Honey Pepperoni',         'هوت هوني بيبروني',
     'Mozzarella and pepperoni grilled to crispy perfection, finished with our signature hot honey sauce for sweet heat.', 20500, true, 2),
  ('hot-drinks',       'espresso',                    'Espresso',                    'إسبريسو', NULL, 5900, false, 1)
) AS x(category_slug, slug, name_en, name_ar, description_en, price, is_signature, sort_order)
JOIN public.menu_categories c ON c.slug = x.category_slug;

-- The Comfort needs a side; sandwiches can take extra sauce
INSERT INTO public.menu_item_addon_groups (menu_item_id, group_id, sort_order)
SELECT i.id, g.id, 1 FROM public.menu_items i, public.addon_groups g
WHERE i.slug = 'the-comfort' AND g.name_en = 'Choose a side';

INSERT INTO public.menu_item_addon_groups (menu_item_id, group_id, sort_order)
SELECT i.id, g.id, 2 FROM public.menu_items i, public.addon_groups g
WHERE i.slug IN ('the-comfort', 'chicken-cream-alfredo', 'hot-honey-pepperoni')
  AND g.name_en = 'Extra sauce';

INSERT INTO public.promo_codes (code, description, discount_type, discount_value, max_discount, min_order_total, per_user_limit)
VALUES ('WELCOME20', '20% off your first order, up to 100 EGP', 'percent', 20, 10000, 15000, 1);

-- =====================================================================
-- END
-- =====================================================================
