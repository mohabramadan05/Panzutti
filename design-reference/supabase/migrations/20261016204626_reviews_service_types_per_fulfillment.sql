-- Service ratings now match how the order was fulfilled:
--   delivery: delivery + delivery_time · pickup: pickup_service + prep_time · dine-in: dining_experience + prep_time
alter table public.reviews drop constraint if exists reviews_kind_check;
alter table public.reviews add constraint reviews_kind_check
  check (kind in ('product','delivery','delivery_time','pickup_service','prep_time','dining_experience'));

create or replace function public.review_kinds_for(_f public.fulfillment_type) returns text[]
language sql immutable set search_path=public as $$
  select case _f when 'delivery' then array['delivery','delivery_time']
                 when 'pickup' then array['pickup_service','prep_time']
                 else array['dining_experience','prep_time'] end $$;
grant execute on function public.review_kinds_for(public.fulfillment_type) to anon, authenticated;

create or replace function public.order_review_state(_token uuid) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare o record;
begin
  select * into o from public.orders where tracking_token = _token;
  if not found then return null; end if;
  return jsonb_build_object(
    'eligible', o.status = 'completed',
    'fulfillment', o.fulfillment,
    'service_kinds', to_jsonb(public.review_kinds_for(o.fulfillment)),
    'products', coalesce((select jsonb_agg(distinct jsonb_build_object('product_id', p.id, 'name', p.name, 'image_url', p.image_url)) from public.order_items i join public.products p on p.id = i.product_id where i.order_id = o.id), '[]'),
    'reviews', coalesce((select jsonb_agg(jsonb_build_object('kind', r.kind, 'product_id', r.product_id, 'rating', r.rating, 'title', r.title, 'body', r.body, 'status', r.status)) from public.reviews r where r.order_id = o.id and r.source = 'customer'), '[]'));
end; $$;

create or replace function public.submit_order_reviews(_token uuid, _reviews jsonb) returns jsonb
language plpgsql security definer set search_path=public as $$
declare o record; rv jsonb; k text; pid uuid; rt int; ttl text; bdy text; st text; email text; n int := 0; recent int;
begin
  select * into o from public.orders where tracking_token = _token for update;
  if not found then raise exception 'Order not found'; end if;
  if o.status <> 'completed' then raise exception 'You can review your order once it is completed'; end if;
  if jsonb_typeof(_reviews) <> 'array' or jsonb_array_length(_reviews) = 0 then raise exception 'Please rate at least one thing'; end if;
  if jsonb_array_length(_reviews) > 30 then raise exception 'Too many reviews at once'; end if;
  select count(*) into recent from public.reviews where order_id = o.id and source = 'customer' and updated_at > now() - interval '1 minute';
  if recent >= 30 then raise exception 'Please wait a moment before updating your review again'; end if;
  st := case when coalesce((select (value->>'auto_publish')::boolean from public.site_settings where key='reviews'), true) then 'published' else 'pending' end;
  if o.user_id is not null then select lower(u.email) into email from auth.users u where u.id = o.user_id; end if;

  for rv in select * from jsonb_array_elements(_reviews) loop
    k := rv->>'kind';
    rt := nullif(rv->>'rating','')::int;
    if rt is null or rt < 1 or rt > 5 then raise exception 'Ratings must be 1 to 5 stars'; end if;
    ttl := nullif(left(trim(regexp_replace(coalesce(rv->>'title',''), '[[:cntrl:]]', ' ', 'g')), 120), '');
    bdy := nullif(left(trim(regexp_replace(coalesce(rv->>'body',''), '[\x00-\x09\x0B-\x1F\x7F]', '', 'g')), 2000), '');
    if k = 'product' then
      pid := nullif(rv->>'product_id','')::uuid;
      if pid is null or not exists (select 1 from public.order_items i where i.order_id = o.id and i.product_id = pid) then
        raise exception 'You can only review items from this order';
      end if;
    elsif k = any(public.review_kinds_for(o.fulfillment)) then
      pid := null;
    elsif k in ('delivery','delivery_time','pickup_service','prep_time','dining_experience') then
      raise exception 'That question does not apply to a % order', replace(o.fulfillment::text, '_', '-');
    else
      raise exception 'Unknown review type';
    end if;

    update public.reviews set rating = rt, title = ttl, body = bdy, customer_email = coalesce(customer_email, email),
      status = case when status = 'hidden' then 'hidden' else st end
    where order_id = o.id and source = 'customer' and kind = k and product_id is not distinct from pid;
    if not found then
      insert into public.reviews(kind, product_id, order_id, user_id, customer_email, customer_name, rating, title, body, source, verified_purchase, status)
      values (k, pid, o.id, o.user_id, email, o.customer_name, rt, ttl, bdy, 'customer', true, st);
    end if;
    n := n + 1;
  end loop;
  return jsonb_build_object('saved', n, 'status', st);
end; $$;

create or replace function public.admin_review_stats() returns jsonb
language plpgsql stable security definer set search_path=public as $$
begin
  if not public.has_role(auth.uid(),'admin') then raise exception 'Not allowed'; end if;
  return (select jsonb_build_object(
    'total', count(*),
    'product_avg', round(avg(rating) filter (where kind='product' and status='published')::numeric,2),
    'product_count', count(*) filter (where kind='product' and status='published'),
    'delivery_avg', round(avg(rating) filter (where kind='delivery' and status='published')::numeric,2),
    'delivery_count', count(*) filter (where kind='delivery' and status='published'),
    'time_avg', round(avg(rating) filter (where kind='delivery_time' and status='published')::numeric,2),
    'time_count', count(*) filter (where kind='delivery_time' and status='published'),
    'kinds', coalesce((select jsonb_object_agg(kind, jsonb_build_object('avg', a, 'count', c)) from (
        select kind, round(avg(rating)::numeric,2) a, count(*) c from public.reviews where status='published' group by kind) k), '{}'),
    'pending', count(*) filter (where status='pending'),
    'published', count(*) filter (where status='published'),
    'hidden', count(*) filter (where status='hidden')) from public.reviews);
end; $$;
revoke execute on function public.admin_review_stats() from anon;
