create or replace function public.quote_order(_p jsonb) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare uid uuid := auth.uid(); priced jsonb; sub numeric; promo record; pdisc numeric := 0; tier record; tier_points int := 0; rdisc numeric := 0; zone record; fee numeric := 0; bal int := 0; ful text := _p->>'fulfillment'; ordcfg jsonb; cfg jsonb := public.timing_cfg();
  prep int; ready timestamptz; deliv timestamptz; travel int := null; sched timestamptz;
begin
  priced := public.price_cart(_p->'items'); sub := (priced->>'subtotal')::numeric;
  select value into ordcfg from public.site_settings where key='ordering';
  prep := public.calc_prep_minutes(_p->'items');
  if ful = 'delivery' then
    if coalesce((ordcfg->>'delivery_enabled')::boolean,true) = false then raise exception 'Delivery is paused right now'; end if;
    select * into zone from public.delivery_zones where id = nullif(_p->>'zone_id','')::uuid and is_active;
    if not found then raise exception 'Please choose a delivery area we serve'; end if;
    if sub < zone.min_order then raise exception 'Minimum order for % is EGP %', zone.name, zone.min_order; end if;
    fee := zone.fee;
    travel := coalesce(zone.eta_minutes, (cfg->>'delivery_minutes')::int, 30);
  elsif ful = 'pickup' then
    if coalesce((ordcfg->>'pickup_enabled')::boolean,true) = false then raise exception 'Pickup is paused right now'; end if;
  elsif ful = 'dine_in' then
    if coalesce((ordcfg->>'dine_in_enabled')::boolean,true) = false then raise exception 'Dine-in ordering is paused right now'; end if;
  else raise exception 'Choose dine-in, delivery or pickup';
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
    tier_points := tier.points;
  end if;
  sched := nullif(_p->>'scheduled_for','')::timestamptz;
  if ful = 'pickup' and sched is not null then ready := sched; else ready := now() + make_interval(mins => prep); end if;
  if ful = 'delivery' then deliv := ready + make_interval(mins => coalesce((cfg->>'dispatch_buffer_minutes')::int,0) + travel); end if;
  return jsonb_build_object('lines', priced->'lines', 'subtotal', sub, 'promo_discount', pdisc, 'reward_discount', rdisc, 'points_redeemed', tier_points, 'delivery_fee', fee, 'total', sub - pdisc - rdisc + fee, 'points_balance', bal, 'points_to_earn', case when uid is null then 0 else floor(greatest(sub-pdisc-rdisc,0))::int end,
    'prep_minutes', prep, 'ready_at', ready, 'delivery_minutes', travel, 'dispatch_buffer_minutes', coalesce((cfg->>'dispatch_buffer_minutes')::int,0), 'delivery_at', deliv);
end; $$;

create or replace function public.place_order(_p jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
declare uid uuid := auth.uid(); q jsonb; oid uuid; onum text; tok uuid; ful public.fulfillment_type; ts timestamptz; ordcfg jsonb; cfg jsonb := public.timing_cfg(); pm public.payment_method; line jsonb; res record; res_id uuid;
  req uuid; ex record; prep int; ready timestamptz; deliv timestamptz; v_phone text; step int; cap int; booked int; days int; adv int;
begin
  v_phone := regexp_replace(coalesce(_p->>'phone',''), '[^0-9+]', '', 'g');
  if coalesce(trim(_p->>'customer_name'),'') = '' then raise exception 'Please enter your name'; end if;
  if length(regexp_replace(v_phone, '[^0-9]', '', 'g')) < 8 then raise exception 'Please enter a valid mobile number'; end if;
  req := nullif(_p->>'request_id','')::uuid;
  if req is not null then
    perform pg_advisory_xact_lock(hashtext(req::text));
    select id, order_number, tracking_token, total into ex from public.orders where client_request_id = req;
    if found then return jsonb_build_object('id', ex.id, 'order_number', ex.order_number, 'tracking_token', ex.tracking_token, 'total', ex.total, 'duplicate', true); end if;
  end if;
  perform pg_advisory_xact_lock(hashtext(coalesce(uid::text, v_phone)));
  if (select count(*) from public.orders o2 where o2.phone = v_phone and o2.created_at > now() - interval '10 minutes') >= 3 then
    raise exception 'Too many orders from this number. Please wait a few minutes or call us.';
  end if;
  ful := (_p->>'fulfillment')::public.fulfillment_type;
  select value into ordcfg from public.site_settings where key='ordering';
  pm := coalesce(nullif(_p->>'payment_method',''),'cash')::public.payment_method;
  if pm = 'card' and coalesce((ordcfg->>'card_enabled')::boolean,false) = false then raise exception 'Online card payment is not available yet'; end if;
  prep := public.calc_prep_minutes(_p->'items');

  if ful = 'delivery' then
    if coalesce(trim(_p->>'address'),'') = '' then raise exception 'Please enter your delivery address'; end if;
    perform public.assert_can_order('delivery', now());
  elsif ful = 'pickup' then
    step := greatest(coalesce((cfg->>'slot_minutes')::int, 15), 5);
    cap := coalesce((cfg->>'pickup_capacity_per_slot')::int, 0);
    days := least(greatest(coalesce((cfg->>'pickup_max_days')::int, 2), 0), 14);
    adv := greatest(prep, coalesce((cfg->>'pickup_min_advance_minutes')::int,0));
    ts := nullif(_p->>'scheduled_for','')::timestamptz;
    if ts is null then ts := now() + make_interval(mins => adv); end if;
    if ts < now() + make_interval(mins => adv) - interval '2 minutes' then
      raise exception 'That pickup time is too soon. The earliest is about % minutes from now.', adv;
    end if;
    if ts > (date_trunc('day', now() at time zone 'Africa/Cairo') + make_interval(days => days + 1)) at time zone 'Africa/Cairo' then raise exception 'That pickup time is too far ahead'; end if;
    perform public.assert_can_order('pickup', ts);
    if cap > 0 then
      select count(*) into booked from public.orders where fulfillment='pickup' and status not in ('cancelled','refunded') and scheduled_for >= to_timestamp(floor(extract(epoch from ts)/(step*60))*step*60) and scheduled_for < to_timestamp(floor(extract(epoch from ts)/(step*60))*step*60) + make_interval(mins => step);
      if booked >= cap then raise exception 'That pickup time is fully booked. Please choose another time.'; end if;
    end if;
  elsif ful = 'dine_in' then
    perform public.assert_can_order('dine_in', now());
    if coalesce(_p->>'reservation_id','') <> '' then
      if uid is null then raise exception 'Sign in to attach a reservation'; end if;
      select * into res from public.reservations where id = (_p->>'reservation_id')::uuid and user_id = uid and status in ('pending','confirmed');
      if not found then raise exception 'That reservation is not active'; end if;
      if exists(select 1 from public.orders where reservation_id = res.id and status not in ('cancelled','refunded')) then raise exception 'This reservation already has an order'; end if;
      res_id := res.id;
      ts := (res.reserved_date + res.reserved_time) at time zone 'Africa/Cairo';
    end if;
  end if;

  q := public.quote_order(_p || jsonb_build_object('scheduled_for', case when ful='pickup' then ts::text else '' end));
  if (q->>'points_redeemed')::int > 0 and (uid is null or public.points_balance(uid) < (q->>'points_redeemed')::int) then raise exception 'Not enough points'; end if;
  ready := (q->>'ready_at')::timestamptz;
  if ful = 'dine_in' and ts is not null and ts > ready then ready := ts; end if;
  deliv := nullif(q->>'delivery_at','')::timestamptz;

  insert into public.orders(user_id, fulfillment, payment_method, customer_name, phone, address, delivery_notes, lat, lng, zone_id, scheduled_for, reservation_id, table_number,
    subtotal, promo_code, promo_discount, reward_tier_id, points_redeemed, reward_discount, delivery_fee, total, notes, client_request_id, prep_minutes, estimated_ready_at, estimated_delivery_at)
  values (uid, ful, pm, trim(_p->>'customer_name'), v_phone,
    case when ful='delivery' then trim(_p->>'address') end,
    case when ful='delivery' then nullif(trim(coalesce(_p->>'delivery_notes','')),'') end,
    case when ful='delivery' then nullif(_p->>'lat','')::numeric end, case when ful='delivery' then nullif(_p->>'lng','')::numeric end,
    case when ful='delivery' then (_p->>'zone_id')::uuid end, ts, case when ful='dine_in' then res_id end,
    case when ful='dine_in' then nullif(trim(coalesce(_p->>'table_number','')),'') end,
    (q->>'subtotal')::numeric, nullif(upper(_p->>'promo_code'),''), (q->>'promo_discount')::numeric, nullif(_p->>'reward_tier_id','')::uuid, (q->>'points_redeemed')::int, (q->>'reward_discount')::numeric, (q->>'delivery_fee')::numeric, (q->>'total')::numeric,
    nullif(trim(coalesce(_p->>'notes','')),''), req, prep, ready, deliv)
  returning id, order_number, tracking_token into oid, onum, tok;
  for line in select * from jsonb_array_elements(q->'lines') loop
    insert into public.order_items(order_id, product_id, product_name, unit_price, quantity, options, line_total, notes)
    values (oid, (line->>'product_id')::uuid, line->>'name', (line->>'unit_price')::numeric, (line->>'quantity')::int, line->'options', (line->>'line_total')::numeric, line->>'notes');
  end loop;
  insert into public.order_status_history(order_id, status, changed_by) values (oid, 'pending', uid);
  insert into public.order_notifications(order_id, event) values (oid, 'received');
  if (q->>'points_redeemed')::int > 0 then
    insert into public.points_ledger(user_id, delta, reason, order_id) values (uid, -(q->>'points_redeemed')::int, 'redeemed', oid);
  end if;
  if coalesce(_p->>'promo_code','') <> '' then update public.promotions set uses = uses + 1 where lower(code)=lower(_p->>'promo_code'); end if;
  return jsonb_build_object('id', oid, 'order_number', onum, 'tracking_token', tok, 'total', q->'total');
end; $$;
