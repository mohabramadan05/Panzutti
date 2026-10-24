create or replace function public.timing_cfg() returns jsonb language sql stable security definer set search_path=public as $$
  select coalesce((select value from public.site_settings where key='timing'), '{}'::jsonb) $$;

create or replace function public.in_window(_ts timestamptz, _start text, _end text) returns boolean language plpgsql immutable set search_path=public as $$
declare t time := (_ts at time zone 'Africa/Cairo')::time; s time; e time;
begin
  if coalesce(_start,'') = '' or coalesce(_end,'') = '' then return true; end if;
  s := _start::time; e := _end::time;
  if e > s then return t >= s and t <= e; else return t >= s or t <= e; end if;
end; $$;

create or replace function public.order_next_statuses(_f public.fulfillment_type, _s public.order_status) returns public.order_status[] language sql immutable set search_path=public as $$
  select case
    when _s = 'pending' then array['confirmed','cancelled']::public.order_status[]
    when _s = 'confirmed' then array['preparing','cancelled']::public.order_status[]
    when _s = 'preparing' then array['ready','cancelled']::public.order_status[]
    when _s = 'ready' and _f = 'delivery' then array['driver_assigned','cancelled']::public.order_status[]
    when _s = 'ready' and _f = 'pickup' then array['collected','cancelled']::public.order_status[]
    when _s = 'ready' and _f = 'dine_in' then array['completed','cancelled']::public.order_status[]
    when _s = 'driver_assigned' then array['picked_up','cancelled']::public.order_status[]
    when _s = 'picked_up' then array['out_for_delivery','cancelled']::public.order_status[]
    when _s = 'out_for_delivery' then array['delivered','cancelled']::public.order_status[]
    when _s = 'delivered' then array['completed']::public.order_status[]
    when _s = 'collected' then array['completed']::public.order_status[]
    when _s = 'completed' then array['refunded']::public.order_status[]
    else array[]::public.order_status[]
  end $$;

create or replace function public.calc_prep_minutes(_items jsonb) returns int language plpgsql stable security definer set search_path=public as $$
declare cfg jsonb := public.timing_cfg(); rule text; buf int; per int; it jsonb; pm int; qty int; mx int := 0; sm int := 0; total_qty int := 0;
begin
  rule := coalesce(cfg->>'calc_rule','longest');
  buf := coalesce((cfg->>'prep_buffer_minutes')::int, 0);
  per := coalesce((cfg->>'per_extra_item_minutes')::int, 0);
  for it in select * from jsonb_array_elements(coalesce(_items,'[]'::jsonb)) loop
    select prep_minutes into pm from public.products where id = (it->>'product_id')::uuid;
    qty := greatest(coalesce((it->>'quantity')::int,1),1);
    pm := coalesce(pm, 0);
    mx := greatest(mx, pm); sm := sm + pm*qty; total_qty := total_qty + qty;
  end loop;
  if total_qty = 0 then return 0; end if;
  if rule = 'sum' then return sm + buf; end if;
  return mx + buf + per * greatest(total_qty - 1, 0);
end; $$;

create or replace function public.assert_can_order(_f text, _ts timestamptz) returns void language plpgsql stable security definer set search_path=public as $$
declare cfg jsonb := public.timing_cfg(); ord jsonb;
begin
  select value into ord from public.site_settings where key='ordering';
  if coalesce((cfg->>'temporarily_closed')::boolean,false) then
    raise exception '%', coalesce(nullif(cfg->>'closed_message',''), 'We are temporarily closed. Please check back soon.');
  end if;
  if coalesce((cfg->>'orders_enabled')::boolean,true) = false then raise exception 'Online ordering is paused right now'; end if;
  if _f = 'delivery' and coalesce((ord->>'delivery_enabled')::boolean,true) = false then raise exception 'Delivery is paused right now'; end if;
  if _f = 'pickup' and coalesce((ord->>'pickup_enabled')::boolean,true) = false then raise exception 'Pickup is paused right now'; end if;
  if _f = 'dine_in' and coalesce((ord->>'dine_in_enabled')::boolean,true) = false then raise exception 'Dine-in ordering is paused right now'; end if;
  if not public.is_open_at(_ts) then raise exception 'We are closed at that time'; end if;
  if _f = 'delivery' and not public.in_window(_ts, cfg->>'delivery_start', cfg->>'delivery_end') then raise exception 'Delivery is not available at this time'; end if;
  if _f = 'pickup' and not public.in_window(_ts, cfg->>'pickup_start', cfg->>'pickup_end') then raise exception 'Pickup is not available at that time'; end if;
end; $$;

create or replace function public.pickup_slots(_items jsonb) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare cfg jsonb := public.timing_cfg(); prep int; step int; adv int; days int; cap int; t timestamptz; lim timestamptz; booked int; slots jsonb := '[]'; n int := 0;
begin
  perform public.price_cart(_items);
  prep := public.calc_prep_minutes(_items);
  step := greatest(coalesce((cfg->>'slot_minutes')::int, 15), 5);
  adv := coalesce((cfg->>'pickup_min_advance_minutes')::int, 0);
  days := least(greatest(coalesce((cfg->>'pickup_max_days')::int, 2), 0), 14);
  cap := coalesce((cfg->>'pickup_capacity_per_slot')::int, 0);
  t := now() + make_interval(mins => greatest(prep, adv));
  t := to_timestamp(ceil(extract(epoch from t) / (step*60)) * step * 60);
  lim := (date_trunc('day', now() at time zone 'Africa/Cairo') + make_interval(days => days + 1)) at time zone 'Africa/Cairo';
  while t < lim and n < 300 loop
    if public.is_open_at(t) and public.in_window(t, cfg->>'pickup_start', cfg->>'pickup_end') then
      booked := 0;
      if cap > 0 then
        select count(*) into booked from public.orders where fulfillment='pickup' and status not in ('cancelled','refunded') and scheduled_for >= t and scheduled_for < t + make_interval(mins => step);
      end if;
      if cap = 0 or booked < cap then slots := slots || to_jsonb(t); n := n + 1; end if;
    end if;
    t := t + make_interval(mins => step);
  end loop;
  return jsonb_build_object('prep_minutes', prep, 'slot_minutes', step, 'earliest', slots->0, 'slots', slots);
end; $$;
