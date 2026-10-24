
create type public.app_role as enum ('admin','customer');
create type public.fulfillment_type as enum ('delivery','pickup','dine_in');
create type public.order_status as enum ('pending','confirmed','preparing','ready','out_for_delivery','completed','cancelled','refunded');
create type public.payment_method as enum ('cash','card');
create type public.payment_status as enum ('unpaid','paid','refunded','failed');
create type public.reservation_status as enum ('pending','confirmed','rejected','cancelled','completed','no_show');

create or replace function public.set_updated_at() returns trigger language plpgsql set search_path=public as $$
begin new.updated_at = now(); return new; end; $$;

-- roles
create table public.user_roles (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade, role app_role not null, unique(user_id, role));
grant select on public.user_roles to authenticated; grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;
create or replace function public.has_role(_user_id uuid, _role app_role) returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.user_roles where user_id=_user_id and role=_role) $$;
create policy "own roles readable" on public.user_roles for select to authenticated using (user_id = auth.uid() or public.has_role(auth.uid(),'admin'));
create policy "admins manage roles" on public.user_roles for all to authenticated using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));

-- profiles
create table public.profiles (id uuid primary key references auth.users(id) on delete cascade, full_name text, phone text, email text, marketing_opt_in boolean not null default false, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
grant select, insert, update on public.profiles to authenticated; grant all on public.profiles to service_role;
alter table public.profiles enable row level security;
create policy "own profile read" on public.profiles for select to authenticated using (id=auth.uid() or public.has_role(auth.uid(),'admin'));
create policy "own profile update" on public.profiles for update to authenticated using (id=auth.uid()) with check (id=auth.uid());
create policy "own profile insert" on public.profiles for insert to authenticated with check (id=auth.uid());
create trigger profiles_updated before update on public.profiles for each row execute function public.set_updated_at();

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into public.profiles(id, full_name, phone, email) values (new.id, new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'phone', new.email) on conflict do nothing;
  insert into public.user_roles(user_id, role) values (new.id, 'customer') on conflict do nothing;
  return new;
end; $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create table public.addresses (id uuid primary key default gen_random_uuid(), user_id uuid not null, label text not null default 'Home', zone_id uuid, address_line text not null, building text, floor text, apartment text, notes text, is_default boolean not null default false, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
grant select, insert, update, delete on public.addresses to authenticated; grant all on public.addresses to service_role;
alter table public.addresses enable row level security;
create policy "own addresses" on public.addresses for all to authenticated using (user_id=auth.uid()) with check (user_id=auth.uid());
create trigger addresses_updated before update on public.addresses for each row execute function public.set_updated_at();

-- menu
create table public.categories (id uuid primary key default gen_random_uuid(), name text not null, slug text not null unique, description text, sort_order int not null default 0, is_visible boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table public.products (id uuid primary key default gen_random_uuid(), category_id uuid references public.categories(id) on delete set null, name text not null, slug text not null unique, description text, ingredients text, image_url text, gallery text[] not null default '{}', price numeric(10,2) not null default 0 check (price >= 0), is_available boolean not null default true, is_published boolean not null default false, is_featured boolean not null default false, allergens text, prep_notes text, sort_order int not null default 0, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table public.option_groups (id uuid primary key default gen_random_uuid(), product_id uuid not null references public.products(id) on delete cascade, name text not null, is_required boolean not null default false, min_select int not null default 0, max_select int not null default 1, sort_order int not null default 0, created_at timestamptz not null default now());
create table public.options (id uuid primary key default gen_random_uuid(), group_id uuid not null references public.option_groups(id) on delete cascade, name text not null, price_delta numeric(10,2) not null default 0, is_available boolean not null default true, sort_order int not null default 0, created_at timestamptz not null default now());
grant select on public.categories, public.products, public.option_groups, public.options to anon, authenticated;
grant insert, update, delete on public.categories, public.products, public.option_groups, public.options to authenticated;
grant all on public.categories, public.products, public.option_groups, public.options to service_role;
alter table public.categories enable row level security; alter table public.products enable row level security; alter table public.option_groups enable row level security; alter table public.options enable row level security;
create policy "public categories" on public.categories for select using (is_visible or public.has_role(auth.uid(),'admin'));
create policy "admin categories" on public.categories for all to authenticated using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));
create policy "public products" on public.products for select using (is_published or public.has_role(auth.uid(),'admin'));
create policy "admin products" on public.products for all to authenticated using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));
create policy "public groups" on public.option_groups for select using (true);
create policy "admin groups" on public.option_groups for all to authenticated using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));
create policy "public options" on public.options for select using (true);
create policy "admin options" on public.options for all to authenticated using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));
create trigger categories_updated before update on public.categories for each row execute function public.set_updated_at();
create trigger products_updated before update on public.products for each row execute function public.set_updated_at();

-- settings, hours, zones
create table public.site_settings (key text primary key, value jsonb not null default '{}', updated_at timestamptz not null default now());
create table public.opening_hours (weekday int primary key check (weekday between 0 and 6), open_time time not null default '12:00', close_time time not null default '23:59', is_closed boolean not null default false);
create table public.delivery_zones (id uuid primary key default gen_random_uuid(), name text not null, fee numeric(10,2) not null default 0, min_order numeric(10,2) not null default 0, eta_minutes int not null default 45, is_active boolean not null default true, sort_order int not null default 0, created_at timestamptz not null default now());
grant select on public.site_settings, public.opening_hours, public.delivery_zones to anon, authenticated;
grant insert, update, delete on public.site_settings, public.opening_hours, public.delivery_zones to authenticated;
grant all on public.site_settings, public.opening_hours, public.delivery_zones to service_role;
alter table public.site_settings enable row level security; alter table public.opening_hours enable row level security; alter table public.delivery_zones enable row level security;
create policy "public settings" on public.site_settings for select using (true);
create policy "admin settings" on public.site_settings for all to authenticated using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));
create policy "public hours" on public.opening_hours for select using (true);
create policy "admin hours" on public.opening_hours for all to authenticated using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));
create policy "public zones" on public.delivery_zones for select using (is_active or public.has_role(auth.uid(),'admin'));
create policy "admin zones" on public.delivery_zones for all to authenticated using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));
alter table public.addresses add constraint addresses_zone_fk foreign key (zone_id) references public.delivery_zones(id) on delete set null;

-- loyalty
create table public.reward_tiers (id uuid primary key default gen_random_uuid(), points int not null unique check (points > 0), discount numeric(10,2) not null check (discount > 0), min_order numeric(10,2) not null default 0, is_active boolean not null default true);
grant select on public.reward_tiers to anon, authenticated; grant insert, update, delete on public.reward_tiers to authenticated; grant all on public.reward_tiers to service_role;
alter table public.reward_tiers enable row level security;
create policy "public tiers" on public.reward_tiers for select using (true);
create policy "admin tiers" on public.reward_tiers for all to authenticated using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));

create table public.points_ledger (id uuid primary key default gen_random_uuid(), user_id uuid not null, delta int not null, reason text not null, order_id uuid, note text, created_by uuid, created_at timestamptz not null default now());
grant select on public.points_ledger to authenticated; grant all on public.points_ledger to service_role;
alter table public.points_ledger enable row level security;
create policy "own points" on public.points_ledger for select to authenticated using (user_id=auth.uid() or public.has_role(auth.uid(),'admin'));
create index points_ledger_user on public.points_ledger(user_id);

create or replace function public.points_balance(_user_id uuid) returns int language sql stable security definer set search_path=public as $$
  select coalesce(sum(delta),0)::int from public.points_ledger where user_id=_user_id $$;
create or replace function public.my_points_balance() returns int language sql stable security definer set search_path=public as $$
  select public.points_balance(auth.uid()) $$;

create or replace function public.admin_adjust_points(_user_id uuid, _delta int, _note text) returns int language plpgsql security definer set search_path=public as $$
declare bal int;
begin
  if not public.has_role(auth.uid(),'admin') then raise exception 'Not allowed'; end if;
  bal := public.points_balance(_user_id);
  if bal + _delta < 0 then raise exception 'Balance cannot go below zero'; end if;
  insert into public.points_ledger(user_id, delta, reason, note, created_by) values (_user_id, _delta, 'adjustment', _note, auth.uid());
  return bal + _delta;
end; $$;

-- promotions
create table public.promotions (id uuid primary key default gen_random_uuid(), code text not null unique, description text, kind text not null default 'fixed' check (kind in ('fixed','percent')), value numeric(10,2) not null check (value > 0), min_order numeric(10,2) not null default 0, starts_at timestamptz, ends_at timestamptz, max_uses int, uses int not null default 0, is_active boolean not null default true, created_at timestamptz not null default now());
grant select, insert, update, delete on public.promotions to authenticated; grant all on public.promotions to service_role;
alter table public.promotions enable row level security;
create policy "admin promotions" on public.promotions for all to authenticated using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));

-- reservations
create table public.reservations (id uuid primary key default gen_random_uuid(), user_id uuid not null, customer_name text not null, phone text not null, reserved_date date not null, reserved_time time not null, guests int not null check (guests between 1 and 30), status reservation_status not null default 'pending', notes text, admin_notes text, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
grant select, update on public.reservations to authenticated; grant all on public.reservations to service_role;
alter table public.reservations enable row level security;
create policy "own reservations read" on public.reservations for select to authenticated using (user_id=auth.uid() or public.has_role(auth.uid(),'admin'));
create policy "admin reservations update" on public.reservations for update to authenticated using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));
create trigger reservations_updated before update on public.reservations for each row execute function public.set_updated_at();

-- orders
create sequence public.order_number_seq start 1001;
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique default ('PZ-' || nextval('public.order_number_seq')::text),
  user_id uuid not null,
  fulfillment fulfillment_type not null,
  status order_status not null default 'pending',
  payment_method payment_method not null default 'cash',
  payment_status payment_status not null default 'unpaid',
  customer_name text not null, phone text not null,
  address text, zone_id uuid references public.delivery_zones(id) on delete set null,
  scheduled_for timestamptz,
  reservation_id uuid references public.reservations(id) on delete set null,
  subtotal numeric(10,2) not null default 0,
  promo_code text, promo_discount numeric(10,2) not null default 0,
  reward_tier_id uuid references public.reward_tiers(id) on delete set null,
  points_redeemed int not null default 0, reward_discount numeric(10,2) not null default 0,
  delivery_fee numeric(10,2) not null default 0,
  total numeric(10,2) not null default 0,
  points_awarded int not null default 0,
  redeemed_refunded boolean not null default false,
  notes text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.order_items (id uuid primary key default gen_random_uuid(), order_id uuid not null references public.orders(id) on delete cascade, product_id uuid references public.products(id) on delete set null, product_name text not null, unit_price numeric(10,2) not null, quantity int not null check (quantity > 0), options jsonb not null default '[]', line_total numeric(10,2) not null, notes text);
create table public.order_status_history (id uuid primary key default gen_random_uuid(), order_id uuid not null references public.orders(id) on delete cascade, status order_status not null, changed_by uuid, created_at timestamptz not null default now());
grant select, update on public.orders to authenticated; grant select on public.order_items, public.order_status_history to authenticated;
grant all on public.orders, public.order_items, public.order_status_history to service_role;
grant usage on sequence public.order_number_seq to service_role;
alter table public.orders enable row level security; alter table public.order_items enable row level security; alter table public.order_status_history enable row level security;
create policy "own orders read" on public.orders for select to authenticated using (user_id=auth.uid() or public.has_role(auth.uid(),'admin'));
create policy "admin orders update" on public.orders for update to authenticated using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));
create policy "own items read" on public.order_items for select to authenticated using (exists(select 1 from public.orders o where o.id=order_id and (o.user_id=auth.uid() or public.has_role(auth.uid(),'admin'))));
create policy "own history read" on public.order_status_history for select to authenticated using (exists(select 1 from public.orders o where o.id=order_id and (o.user_id=auth.uid() or public.has_role(auth.uid(),'admin'))));
create index orders_user on public.orders(user_id); create index order_items_order on public.order_items(order_id);

-- order status trigger: history + points
create or replace function public.orders_status_change() returns trigger language plpgsql security definer set search_path=public as $$
declare earn int; bal int; rev int;
begin
  if new.status is distinct from old.status then
    insert into public.order_status_history(order_id, status, changed_by) values (new.id, new.status, auth.uid());
    if new.status = 'completed' and old.points_awarded = 0 then
      earn := floor(greatest(new.subtotal - new.promo_discount - new.reward_discount, 0))::int;
      if earn > 0 then
        insert into public.points_ledger(user_id, delta, reason, order_id) values (new.user_id, earn, 'earned', new.id);
        new.points_awarded := earn;
      end if;
    end if;
    if new.status in ('cancelled','refunded') then
      if old.points_awarded > 0 then
        bal := public.points_balance(new.user_id);
        rev := least(old.points_awarded, greatest(bal,0));
        if rev > 0 then insert into public.points_ledger(user_id, delta, reason, order_id, note) values (new.user_id, -rev, 'reversal', new.id, 'Order ' || new.status::text); end if;
        new.points_awarded := 0;
      end if;
      if old.points_redeemed > 0 and not old.redeemed_refunded then
        insert into public.points_ledger(user_id, delta, reason, order_id, note) values (new.user_id, old.points_redeemed, 'redeem_refund', new.id, 'Order ' || new.status::text);
        new.redeemed_refunded := true;
      end if;
    end if;
  end if;
  return new;
end; $$;
create trigger orders_status_trg before update on public.orders for each row execute function public.orders_status_change();
create trigger orders_updated before update on public.orders for each row execute function public.set_updated_at();

-- opening check (Cairo time)
create or replace function public.is_open_at(_ts timestamptz) returns boolean language plpgsql stable security definer set search_path=public as $$
declare local timestamp := _ts at time zone 'Africa/Cairo'; h record; t time := local::time;
begin
  select * into h from public.opening_hours where weekday = extract(dow from local)::int;
  if not found or h.is_closed then return false; end if;
  if h.close_time > h.open_time then return t >= h.open_time and t <= h.close_time;
  else return t >= h.open_time or t <= h.close_time; end if;
end; $$;

-- reservation creation with capacity check
create or replace function public.create_reservation(_date date, _time time, _guests int, _name text, _phone text, _notes text) returns uuid language plpgsql security definer set search_path=public as $$
declare uid uuid := auth.uid(); cfg jsonb; cap int; maxp int; booked int; rid uuid; ts timestamptz;
begin
  if uid is null then raise exception 'Please sign in to book a table'; end if;
  select value into cfg from public.site_settings where key='reservations';
  if coalesce((cfg->>'enabled')::boolean, true) = false then raise exception 'Reservations are currently closed'; end if;
  cap := coalesce((cfg->>'capacity_per_slot')::int, 20); maxp := coalesce((cfg->>'max_party')::int, 10);
  if _guests < 1 or _guests > maxp then raise exception 'Party size must be between 1 and %', maxp; end if;
  if coalesce(trim(_name),'') = '' or coalesce(trim(_phone),'') = '' then raise exception 'Name and phone are required'; end if;
  ts := (_date + _time) at time zone 'Africa/Cairo';
  if ts < now() + interval '30 minutes' then raise exception 'Please choose a later time'; end if;
  if not public.is_open_at(ts) then raise exception 'We are closed at that time'; end if;
  perform pg_advisory_xact_lock(hashtext(_date::text || _time::text));
  select coalesce(sum(guests),0) into booked from public.reservations where reserved_date=_date and reserved_time=_time and status in ('pending','confirmed');
  if booked + _guests > cap then raise exception 'That time is fully booked. Please pick another slot.'; end if;
  insert into public.reservations(user_id, customer_name, phone, reserved_date, reserved_time, guests, notes) values (uid, _name, _phone, _date, _time, _guests, _notes) returning id into rid;
  return rid;
end; $$;

create or replace function public.slot_availability(_date date) returns table(slot time, booked int, capacity int) language plpgsql stable security definer set search_path=public as $$
declare cfg jsonb; cap int; step int; h record; t time; endt time;
begin
  select value into cfg from public.site_settings where key='reservations';
  cap := coalesce((cfg->>'capacity_per_slot')::int, 20); step := coalesce((cfg->>'slot_minutes')::int, 30);
  select * into h from public.opening_hours where weekday = extract(dow from _date)::int;
  if not found or h.is_closed then return; end if;
  t := h.open_time; endt := case when h.close_time > h.open_time then h.close_time - interval '60 minutes' else time '23:00' end;
  while t <= endt loop
    slot := t; capacity := cap;
    select coalesce(sum(r.guests),0)::int into booked from public.reservations r where r.reserved_date=_date and r.reserved_time=t and r.status in ('pending','confirmed');
    return next;
    t := t + make_interval(mins => step);
    exit when t < h.open_time;
  end loop;
end; $$;

-- quote / place order
create or replace function public.price_cart(_items jsonb) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare it jsonb; p record; g record; opt record; qty int; unit numeric; cnt int; lines jsonb := '[]'; sub numeric := 0; opts jsonb; oid uuid;
begin
  if _items is null or jsonb_array_length(_items) = 0 then raise exception 'Your cart is empty'; end if;
  for it in select * from jsonb_array_elements(_items) loop
    select * into p from public.products where id = (it->>'product_id')::uuid;
    if not found or not p.is_published or not p.is_available then raise exception 'An item in your cart is no longer available'; end if;
    qty := coalesce((it->>'quantity')::int, 1);
    if qty < 1 or qty > 50 then raise exception 'Invalid quantity for %', p.name; end if;
    unit := p.price; opts := '[]';
    for oid in select (jsonb_array_elements_text(coalesce(it->'option_ids','[]')))::uuid loop
      select o.*, og.product_id, og.name as group_name into opt from public.options o join public.option_groups og on og.id=o.group_id where o.id=oid;
      if not found or opt.product_id <> p.id or not opt.is_available then raise exception 'A choice for % is no longer available', p.name; end if;
      unit := unit + opt.price_delta;
      opts := opts || jsonb_build_object('id', opt.id, 'group', opt.group_name, 'name', opt.name, 'price_delta', opt.price_delta);
    end loop;
    for g in select * from public.option_groups where product_id = p.id loop
      select count(*) into cnt from jsonb_array_elements_text(coalesce(it->'option_ids','[]')) x join public.options o on o.id = x::uuid where o.group_id = g.id;
      if g.is_required and cnt < greatest(g.min_select,1) then raise exception 'Please choose % for %', g.name, p.name; end if;
      if g.max_select > 0 and cnt > g.max_select then raise exception 'Too many choices for % on %', g.name, p.name; end if;
    end loop;
    lines := lines || jsonb_build_object('product_id', p.id, 'name', p.name, 'unit_price', unit, 'quantity', qty, 'options', opts, 'line_total', unit*qty, 'notes', it->>'notes');
    sub := sub + unit*qty;
  end loop;
  return jsonb_build_object('lines', lines, 'subtotal', sub);
end; $$;

create or replace function public.quote_order(_p jsonb) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare uid uuid := auth.uid(); priced jsonb; sub numeric; promo record; pdisc numeric := 0; tier record; rdisc numeric := 0; zone record; fee numeric := 0; bal int := 0; ful text := _p->>'fulfillment'; ordcfg jsonb;
begin
  priced := public.price_cart(_p->'items'); sub := (priced->>'subtotal')::numeric;
  select value into ordcfg from public.site_settings where key='ordering';
  if ful = 'delivery' then
    if coalesce((ordcfg->>'delivery_enabled')::boolean,true) = false then raise exception 'Delivery is paused right now'; end if;
    select * into zone from public.delivery_zones where id = nullif(_p->>'zone_id','')::uuid and is_active;
    if not found then raise exception 'Please choose a delivery area we serve'; end if;
    if sub < zone.min_order then raise exception 'Minimum order for % is EGP %', zone.name, zone.min_order; end if;
    fee := zone.fee;
  elsif ful = 'pickup' then
    if coalesce((ordcfg->>'pickup_enabled')::boolean,true) = false then raise exception 'Pickup is paused right now'; end if;
  elsif ful <> 'dine_in' then raise exception 'Choose delivery, pickup or dine-in';
  end if;
  if coalesce(_p->>'promo_code','') <> '' then
    select * into promo from public.promotions where lower(code)=lower(_p->>'promo_code') and is_active and (starts_at is null or starts_at<=now()) and (ends_at is null or ends_at>=now()) and (max_uses is null or uses<max_uses);
    if not found then raise exception 'That promo code is not valid'; end if;
    if sub < promo.min_order then raise exception 'This code needs a minimum order of EGP %', promo.min_order; end if;
    pdisc := case when promo.kind='percent' then round(sub*promo.value/100,2) else promo.value end;
    pdisc := least(pdisc, sub);
  end if;
  if uid is not null then bal := public.points_balance(uid); end if;
  if coalesce(_p->>'reward_tier_id','') <> '' then
    if uid is null then raise exception 'Sign in to use rewards'; end if;
    select * into tier from public.reward_tiers where id=(_p->>'reward_tier_id')::uuid and is_active;
    if not found then raise exception 'That reward is not available'; end if;
    if bal < tier.points then raise exception 'You need % points for this reward', tier.points; end if;
    if sub - pdisc < tier.min_order then raise exception 'This reward needs a minimum order of EGP %', tier.min_order; end if;
    rdisc := least(tier.discount, sub - pdisc);
  end if;
  return jsonb_build_object('lines', priced->'lines', 'subtotal', sub, 'promo_discount', pdisc, 'reward_discount', rdisc, 'points_redeemed', coalesce(tier.points,0), 'delivery_fee', fee, 'total', sub - pdisc - rdisc + fee, 'points_balance', bal, 'points_to_earn', floor(greatest(sub-pdisc-rdisc,0))::int);
end; $$;

create or replace function public.place_order(_p jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
declare uid uuid := auth.uid(); q jsonb; oid uuid; onum text; ful fulfillment_type; ts timestamptz; ordcfg jsonb; pm payment_method; line jsonb; res record; lead int;
begin
  if uid is null then raise exception 'Please sign in to place an order'; end if;
  if coalesce(trim(_p->>'customer_name'),'') = '' or coalesce(trim(_p->>'phone'),'') = '' then raise exception 'Name and phone are required'; end if;
  perform pg_advisory_xact_lock(hashtext(uid::text));
  q := public.quote_order(_p);
  ful := (_p->>'fulfillment')::fulfillment_type;
  select value into ordcfg from public.site_settings where key='ordering';
  pm := coalesce(nullif(_p->>'payment_method',''),'cash')::payment_method;
  if pm = 'card' and coalesce((ordcfg->>'card_enabled')::boolean,false) = false then raise exception 'Online card payment is not available yet'; end if;
  lead := coalesce((ordcfg->>'pickup_lead_minutes')::int, 20);
  if ful = 'delivery' then
    if coalesce(trim(_p->>'address'),'') = '' then raise exception 'Please enter your delivery address'; end if;
    if not public.is_open_at(now()) then raise exception 'We are closed right now'; end if;
  elsif ful = 'pickup' then
    ts := nullif(_p->>'scheduled_for','')::timestamptz;
    if ts is null then ts := now() + make_interval(mins => lead); end if;
    if ts < now() + make_interval(mins => lead - 1) then raise exception 'Pickup time must be at least % minutes from now', lead; end if;
    if not public.is_open_at(ts) then raise exception 'We are closed at that pickup time'; end if;
  elsif ful = 'dine_in' then
    select * into res from public.reservations where id = nullif(_p->>'reservation_id','')::uuid and user_id = uid and status in ('pending','confirmed');
    if not found then raise exception 'Pre-orders need an active reservation'; end if;
    if exists(select 1 from public.orders where reservation_id = res.id and status not in ('cancelled','refunded')) then raise exception 'This reservation already has a pre-order'; end if;
    ts := (res.reserved_date + res.reserved_time) at time zone 'Africa/Cairo';
  end if;
  if (q->>'points_redeemed')::int > 0 and public.points_balance(uid) < (q->>'points_redeemed')::int then raise exception 'Not enough points'; end if;
  insert into public.orders(user_id, fulfillment, payment_method, customer_name, phone, address, zone_id, scheduled_for, reservation_id, subtotal, promo_code, promo_discount, reward_tier_id, points_redeemed, reward_discount, delivery_fee, total, notes)
  values (uid, ful, pm, trim(_p->>'customer_name'), trim(_p->>'phone'), case when ful='delivery' then _p->>'address' end, case when ful='delivery' then (_p->>'zone_id')::uuid end, ts, case when ful='dine_in' then res.id end,
    (q->>'subtotal')::numeric, nullif(upper(_p->>'promo_code'),''), (q->>'promo_discount')::numeric, nullif(_p->>'reward_tier_id','')::uuid, (q->>'points_redeemed')::int, (q->>'reward_discount')::numeric, (q->>'delivery_fee')::numeric, (q->>'total')::numeric, _p->>'notes')
  returning id, order_number into oid, onum;
  for line in select * from jsonb_array_elements(q->'lines') loop
    insert into public.order_items(order_id, product_id, product_name, unit_price, quantity, options, line_total, notes)
    values (oid, (line->>'product_id')::uuid, line->>'name', (line->>'unit_price')::numeric, (line->>'quantity')::int, line->'options', (line->>'line_total')::numeric, line->>'notes');
  end loop;
  insert into public.order_status_history(order_id, status, changed_by) values (oid, 'pending', uid);
  if (q->>'points_redeemed')::int > 0 then
    insert into public.points_ledger(user_id, delta, reason, order_id) values (uid, -(q->>'points_redeemed')::int, 'redeemed', oid);
  end if;
  if coalesce(_p->>'promo_code','') <> '' then update public.promotions set uses = uses + 1 where lower(code)=lower(_p->>'promo_code'); end if;
  return jsonb_build_object('id', oid, 'order_number', onum, 'total', q->'total');
end; $$;

create or replace function public.cancel_my_reservation(_id uuid) returns void language plpgsql security definer set search_path=public as $$
begin
  update public.reservations set status='cancelled' where id=_id and user_id=auth.uid() and status in ('pending','confirmed');
  if not found then raise exception 'Reservation cannot be cancelled'; end if;
  update public.orders set status='cancelled' where reservation_id=_id and status='pending';
end; $$;

-- journal
create table public.articles (id uuid primary key default gen_random_uuid(), title text not null, slug text not null unique, excerpt text, body text not null default '', cover_url text, category text, author text, status text not null default 'draft' check (status in ('draft','published')), is_featured boolean not null default false, published_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
grant select on public.articles to anon, authenticated; grant insert, update, delete on public.articles to authenticated; grant all on public.articles to service_role;
alter table public.articles enable row level security;
create policy "public articles" on public.articles for select using (status='published' or public.has_role(auth.uid(),'admin'));
create policy "admin articles" on public.articles for all to authenticated using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));
create trigger articles_updated before update on public.articles for each row execute function public.set_updated_at();

-- admin customers view helper
create or replace function public.admin_customers() returns table(id uuid, full_name text, email text, phone text, created_at timestamptz, orders_count bigint, total_spent numeric, points int) language plpgsql stable security definer set search_path=public as $$
begin
  if not public.has_role(auth.uid(),'admin') then raise exception 'Not allowed'; end if;
  return query select p.id, p.full_name, p.email, p.phone, p.created_at,
    (select count(*) from public.orders o where o.user_id=p.id),
    (select coalesce(sum(o.total),0) from public.orders o where o.user_id=p.id and o.status='completed'),
    public.points_balance(p.id)
  from public.profiles p order by p.created_at desc;
end; $$;

revoke execute on function public.place_order(jsonb), public.create_reservation(date,time,int,text,text,text), public.cancel_my_reservation(uuid), public.admin_adjust_points(uuid,int,text), public.admin_customers(), public.my_points_balance() from anon;

-- storage policies for media bucket (bucket created separately)
create policy "media public read" on storage.objects for select using (bucket_id='media');
create policy "media admin write" on storage.objects for insert to authenticated with check (bucket_id='media' and public.has_role(auth.uid(),'admin'));
create policy "media admin update" on storage.objects for update to authenticated using (bucket_id='media' and public.has_role(auth.uid(),'admin'));
create policy "media admin delete" on storage.objects for delete to authenticated using (bucket_id='media' and public.has_role(auth.uid(),'admin'));

-- seeds
insert into public.reward_tiers(points, discount) values (1000,100),(1500,150),(2000,300);
insert into public.site_settings(key, value) values
 ('announcement', '{"enabled":false,"text":"","link":""}'),
 ('location', '{"address":"Meraki Complex, Heliopolis","map_url":"","phone":"","email":"","whatsapp":""}'),
 ('socials', '{"instagram":"","facebook":"","tiktok":""}'),
 ('ordering', '{"delivery_enabled":true,"pickup_enabled":true,"card_enabled":false,"pickup_lead_minutes":20}'),
 ('reservations', '{"enabled":true,"capacity_per_slot":20,"slot_minutes":30,"max_party":10,"preorder_payment":"pay_at_restaurant"}'),
 ('policies', '{"terms":"","privacy":"","delivery":"","refunds":"","loyalty":"","faq":[]}'),
 ('home', '{"hero_title":"Your Next Favorite Bite.","hero_subtitle":"Freshly baked panuozzo. Italian inspiration. PANZUTTI attitude.","hero_image":"","story_title":"Egyptian heart. Italian dough.","story_body":"","story_image":""}');
insert into public.opening_hours(weekday) select g from generate_series(0,6) g;

insert into public.categories(name, slug, sort_order) values ('Breakfast Panuozzi','breakfast-panuozzi',1),('Lunch Panuozzi','lunch-panuozzi',2),('Appetizers & Sides','sides',3),('Salads','salads',4),('Desserts','desserts',5),('Drinks','drinks',6);

insert into public.products(category_id, name, slug, description, sort_order)
select c.id, v.name, v.slug, v.descr, v.ord from (values
 ('breakfast-panuozzi','Capri','capri','A freshly made sourdough panuozzo bringing together creamy buffalo mozzarella, ripe tomatoes, fresh basil, pesto sauce and balsamic glaze.',1),
 ('breakfast-panuozzi','Easy Morning','easy-morning','Soft creamy scrambled eggs, parmesan cheese and fresh rocca leaves tucked inside our freshly made sourdough panuozzo.',2),
 ('breakfast-panuozzi','The Comfort','the-comfort','A golden fried sourdough panuozzo filled with rich marinara sauce, fresh mozzarella, basil leaves and parmesan, served with classic salad or crispy chips.',3),
 ('breakfast-panuozzi','Fresh and Smoked','fresh-and-smoked','Premium smoked salmon, cream cheese, rocca leaves, pickled onions and capers in a freshly made sourdough panuozzo.',4),
 ('breakfast-panuozzi','Deli Delights','deli-delights','Silky burrata, smoked turkey, delicate bresaola and crisp lettuce, finished with a drizzle of balsamic glaze.',5),
 ('breakfast-panuozzi','Everyday Routine','everyday-routine','Smoked turkey, lettuce, cheddar cheese and sun-dried tomatoes, finished with our rich garlic parmesan sauce.',6),
 ('breakfast-panuozzi','Caramelized Beef','caramelized-beef','Premium roast beef, slow-caramelized onions, fresh rocca and tangy pickles with a creamy pepper mayo sauce.',7),
 ('breakfast-panuozzi','The Local','the-local','Egyptian-inspired: crispy ta''ameya with creamy tahini, rocca, tomatoes and pickles, served with fried chips on the side.',8),
 ('breakfast-panuozzi','Marinara Shakshouka','marinara-shakshouka','Creamy shakshouka-style scrambled eggs, rich marinara sauce, parmesan and rocca.',9),
 ('lunch-panuozzi','Chicken Cream Alfredo','chicken-cream-alfredo','Grilled chicken breast, fresh rocca and parmesan with creamy alfredo mushroom sauce.',1),
 ('lunch-panuozzi','Caesar Club','caesar-club','Grilled chicken breast, lettuce, parmesan cheese and rich Caesar dressing.',2),
 ('lunch-panuozzi','Golden Chicken Parm','golden-chicken-parm','Crispy fried panuozzo with marinara, melted mozzarella, golden fried chicken breast, rocca, basil and parmesan.',3),
 ('lunch-panuozzi','Grilled Chicken Pesto','grilled-chicken-pesto','Grilled chicken breast, sun-dried tomatoes, parmesan and creamy pesto mayonnaise.',4),
 ('lunch-panuozzi','Hot Honey Pepperoni','hot-honey-pepperoni','Mozzarella and pepperoni, grilled to crispy perfection and finished with signature hot honey sauce.',5),
 ('lunch-panuozzi','Truffle State','truffle-state','Smashed beef patties, sautéed mushrooms, cheddar, caramelized onions, parmesan and rich truffle mayonnaise.',6),
 ('lunch-panuozzi','Philly Sausage','philly-sausage','Sausage, mushrooms, colored bell peppers, caramelized onions and cheddar, finished with our signature smoked sauce.',7),
 ('lunch-panuozzi','Brisket Sesame','brisket-sesame','Tender brisket, crisp Asian slaw, rich gravy and pepper mayo, finished with smokey sauce and roasted sesame.',8),
 ('lunch-panuozzi','Shrimp Luxe','shrimp-luxe','Golden crispy shrimp in bold dynamite sauce with fresh lettuce.',9),
 ('lunch-panuozzi','Shrimp & Zest','shrimp-and-zest','Grilled shrimp with zesty lemon dill sauce, fresh rocca and shaved parmesan.',10),
 ('sides','Fried Truffle Buffalo Balls','fried-truffle-buffalo-balls',null,1),
 ('sides','Rustic Wedges','rustic-wedges',null,2),
 ('sides','Sausage Arancini Balls','sausage-arancini-balls',null,3),
 ('sides','Chicken Arancini Balls','chicken-arancini-balls',null,4),
 ('sides','Shrimp Arancini Balls','shrimp-arancini-balls',null,5),
 ('sides','Chicken Rolls','chicken-rolls',null,6),
 ('sides','Chips','chips',null,7),
 ('salads','Original Caprese','original-caprese',null,1),
 ('salads','Arugula Lemon Shrimp','arugula-lemon-shrimp',null,2),
 ('salads','Peach Bliss','peach-bliss',null,3),
 ('salads','Classic Caesar','classic-caesar',null,4),
 ('desserts','Nutella Panuozzo','nutella-panuozzo','An irresistible freshly made cocoa-dough panuozzo filled generously with creamy Nutella.',1),
 ('desserts','Chocolate Temptation','chocolate-temptation','Original panuozzo dough filled with mascarpone and melted marshmallow, topped with Nutella and crushed hazelnuts.',2),
 ('desserts','Iconic Tiramisu','iconic-tiramisu','Rich mascarpone cream, coffee-soaked lady fingers and a cocoa powder finish.',3)
) v(cat, name, slug, descr, ord) join public.categories c on c.slug = v.cat;

insert into public.option_groups(product_id, name, is_required, min_select, max_select, sort_order)
select p.id, 'Bread', true, 1, 1, 1 from public.products p join public.categories c on c.id=p.category_id where c.slug in ('breakfast-panuozzi','lunch-panuozzi');
insert into public.options(group_id, name, sort_order)
select g.id, v.n, v.o from public.option_groups g, (values ('Plain',1),('Plain with melted mozzarella',2),('Spicy chili flakes',3)) v(n,o) where g.name='Bread';
insert into public.option_groups(product_id, name, is_required, min_select, max_select, sort_order)
select p.id, 'Preparation', true, 1, 1, 2 from public.products p join public.categories c on c.id=p.category_id where c.slug in ('breakfast-panuozzi','lunch-panuozzi');
insert into public.options(group_id, name, sort_order)
select g.id, v.n, v.o from public.option_groups g, (values ('Baked',1),('Fried',2)) v(n,o) where g.name='Preparation';
