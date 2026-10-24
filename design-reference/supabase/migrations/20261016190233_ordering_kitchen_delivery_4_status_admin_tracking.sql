create or replace function public.orders_status_change() returns trigger language plpgsql security definer set search_path=public as $$
declare earn int; bal int; rev int; note text := nullif(current_setting('pz.status_note', true), '');
begin
  if new.status is distinct from old.status then
    if not (new.status = any(public.order_next_statuses(new.fulfillment, old.status))) then
      raise exception 'Cannot move a % order from % to %', new.fulfillment, old.status, new.status;
    end if;
    if new.status = 'driver_assigned' and new.driver_id is null then raise exception 'Assign a delivery person first'; end if;
    if new.status = 'cancelled' and coalesce(new.cancel_reason, note, '') = '' then raise exception 'A cancellation reason is required'; end if;
    insert into public.order_status_history(order_id, status, changed_by, note) values (new.id, new.status, auth.uid(), note);
    if new.status in ('confirmed','preparing','ready','driver_assigned','out_for_delivery','delivered','collected','completed','cancelled') then
      insert into public.order_notifications(order_id, event) values (new.id, new.status::text);
    end if;
    if new.status = 'completed' and new.payment_method = 'cash' then new.payment_status := 'paid'; end if;
    if new.status = 'completed' and old.points_awarded = 0 and new.user_id is not null then
      earn := floor(greatest(new.subtotal - new.promo_discount - new.reward_discount, 0))::int;
      if earn > 0 then
        insert into public.points_ledger(user_id, delta, reason, order_id) values (new.user_id, earn, 'earned', new.id);
        new.points_awarded := earn;
      end if;
    end if;
    if new.status in ('cancelled','refunded') and new.user_id is not null then
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

create or replace function public.cancel_my_reservation(_id uuid) returns void language plpgsql security definer set search_path=public as $$
begin
  update public.reservations set status='cancelled' where id=_id and user_id=auth.uid() and status in ('pending','confirmed');
  if not found then raise exception 'Reservation cannot be cancelled'; end if;
  update public.orders set status='cancelled', cancel_reason='Reservation cancelled by customer' where reservation_id=_id and status='pending';
end; $$;

create or replace function public.admin_update_order_status(_order uuid, _status public.order_status, _note text default null) returns void language plpgsql security definer set search_path=public as $$
begin
  if not public.has_role(auth.uid(),'admin') then raise exception 'Not allowed'; end if;
  if _status = 'cancelled' and coalesce(trim(_note),'') = '' then raise exception 'A cancellation reason is required'; end if;
  perform set_config('pz.status_note', coalesce(_note,''), true);
  update public.orders set status = _status,
    cancel_reason = case when _status='cancelled' then trim(_note) else cancel_reason end,
    estimated_ready_at = case when _status='ready' and estimated_ready_at > now() then now() else estimated_ready_at end
  where id = _order;
  if not found then raise exception 'Order not found'; end if;
  perform set_config('pz.status_note', '', true);
end; $$;

create or replace function public.admin_assign_driver(_order uuid, _driver uuid, _reason text default null) returns void language plpgsql security definer set search_path=public as $$
declare o record; d record;
begin
  if not public.has_role(auth.uid(),'admin') then raise exception 'Not allowed'; end if;
  select * into o from public.orders where id = _order for update;
  if not found then raise exception 'Order not found'; end if;
  if o.fulfillment <> 'delivery' then raise exception 'Only delivery orders get a delivery person'; end if;
  if o.status not in ('confirmed','preparing','ready','driver_assigned','picked_up','out_for_delivery') then raise exception 'This order can no longer be assigned'; end if;
  select * into d from public.drivers where id = _driver;
  if not found then raise exception 'Delivery person not found'; end if;
  if not d.is_active then raise exception '% is inactive and cannot take orders', d.full_name; end if;
  if o.driver_id is not distinct from _driver then return; end if;
  update public.driver_assignments set unassigned_at = now(), reason = coalesce(nullif(trim(_reason),''), 'Reassigned') where order_id = _order and unassigned_at is null;
  insert into public.driver_assignments(order_id, driver_id, assigned_by, reason) values (_order, _driver, auth.uid(), nullif(trim(_reason),''));
  update public.orders set driver_id = _driver where id = _order;
  if o.status = 'ready' then
    perform set_config('pz.status_note', 'Assigned to ' || d.full_name, true);
    update public.orders set status = 'driver_assigned' where id = _order;
    perform set_config('pz.status_note', '', true);
  elsif o.driver_id is not null then
    insert into public.order_status_history(order_id, status, changed_by, note) values (_order, o.status, auth.uid(), 'Delivery person changed to ' || d.full_name);
  end if;
end; $$;

create or replace function public.admin_adjust_estimate(_order uuid, _minutes int, _reason text) returns void language plpgsql security definer set search_path=public as $$
declare o record;
begin
  if not public.has_role(auth.uid(),'admin') then raise exception 'Not allowed'; end if;
  if coalesce(trim(_reason),'') = '' then raise exception 'Please give a reason for the new time'; end if;
  if _minutes = 0 or abs(_minutes) > 240 then raise exception 'Adjust by 1 to 240 minutes'; end if;
  select * into o from public.orders where id = _order for update;
  if not found then raise exception 'Order not found'; end if;
  if o.status in ('completed','cancelled','refunded','delivered','collected') then raise exception 'This order is already finished'; end if;
  update public.orders set
    estimated_ready_at = greatest(coalesce(estimated_ready_at, now()) + make_interval(mins => _minutes), now()),
    estimated_delivery_at = case when estimated_delivery_at is null then null else greatest(estimated_delivery_at + make_interval(mins => _minutes), now()) end,
    estimate_note = trim(_reason)
  where id = _order;
  insert into public.order_status_history(order_id, status, changed_by, note) values (_order, o.status, auth.uid(), 'Time updated by ' || _minutes || ' min: ' || trim(_reason));
  if _minutes > 0 then insert into public.order_notifications(order_id, event) values (_order, 'delayed'); end if;
end; $$;

create or replace function public.get_tracked_order(_token uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare o record; loc jsonb; drv jsonb := null;
begin
  select * into o from public.orders where tracking_token = _token;
  if not found then return null; end if;
  select value into loc from public.site_settings where key='location';
  if o.driver_id is not null and o.status in ('driver_assigned','picked_up','out_for_delivery','delivered') then
    select jsonb_build_object('name', full_name, 'phone', phone) into drv from public.drivers where id = o.driver_id;
  end if;
  return jsonb_build_object(
    'id', o.id, 'order_number', o.order_number, 'fulfillment', o.fulfillment, 'status', o.status, 'created_at', o.created_at,
    'customer_name', o.customer_name, 'scheduled_for', o.scheduled_for, 'table_number', o.table_number,
    'prep_minutes', o.prep_minutes, 'estimated_ready_at', o.estimated_ready_at, 'estimated_delivery_at', o.estimated_delivery_at, 'estimate_note', o.estimate_note,
    'address', o.address, 'delivery_notes', o.delivery_notes, 'cancel_reason', o.cancel_reason, 'notes', o.notes,
    'subtotal', o.subtotal, 'promo_code', o.promo_code, 'promo_discount', o.promo_discount, 'reward_discount', o.reward_discount, 'points_redeemed', o.points_redeemed, 'points_awarded', o.points_awarded,
    'delivery_fee', o.delivery_fee, 'total', o.total, 'payment_method', o.payment_method, 'payment_status', o.payment_status,
    'items', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'name', i.product_name, 'quantity', i.quantity, 'unit_price', i.unit_price, 'line_total', i.line_total, 'options', i.options, 'notes', i.notes) order by i.id) from public.order_items i where i.order_id = o.id), '[]'),
    'history', coalesce((select jsonb_agg(jsonb_build_object('status', h.status, 'at', h.created_at, 'note', h.note) order by h.created_at) from public.order_status_history h where h.order_id = o.id), '[]'),
    'driver', drv,
    'restaurant', jsonb_build_object('address', loc->>'address', 'phone', loc->>'phone', 'map_url', loc->>'map_url', 'lat', loc->>'lat', 'lng', loc->>'lng')
  );
end; $$;

revoke execute on function public.timing_cfg(), public.calc_prep_minutes(jsonb), public.assert_can_order(text, timestamptz) from public, anon, authenticated;
revoke execute on function public.admin_update_order_status(uuid, public.order_status, text), public.admin_assign_driver(uuid, uuid, text), public.admin_adjust_estimate(uuid, int, text) from public, anon;
grant execute on function public.admin_update_order_status(uuid, public.order_status, text), public.admin_assign_driver(uuid, uuid, text), public.admin_adjust_estimate(uuid, int, text) to authenticated;
revoke execute on function public.place_order(jsonb) from public;
grant execute on function public.place_order(jsonb), public.quote_order(jsonb), public.pickup_slots(jsonb), public.get_tracked_order(uuid) to anon, authenticated;
grant execute on function public.order_next_statuses(public.fulfillment_type, public.order_status), public.in_window(timestamptz, text, text) to anon, authenticated;
