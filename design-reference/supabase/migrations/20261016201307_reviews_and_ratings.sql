-- Reviews: product quality, delivery experience and delivery time, kept separate by kind.
create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('product','delivery','delivery_time')),
  product_id uuid references public.products(id) on delete cascade,
  order_id uuid references public.orders(id) on delete set null,
  user_id uuid,
  customer_email text,
  customer_name text,
  rating smallint not null check (rating between 1 and 5),
  title text check (title is null or length(title) <= 120),
  body text check (body is null or length(body) <= 2000),
  source text not null default 'customer' check (source in ('customer','admin')),
  verified_purchase boolean not null default false,
  status text not null default 'pending' check (status in ('pending','published','hidden')),
  admin_note text,
  admin_edited boolean not null default false,
  created_by uuid,
  edited_by uuid,
  edited_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reviews_product_kind check ((kind = 'product') = (product_id is not null))
);
create unique index if not exists reviews_one_per_order_item on public.reviews(order_id, kind, coalesce(product_id, '00000000-0000-0000-0000-000000000000'::uuid)) where source = 'customer' and order_id is not null;
create index if not exists reviews_product_pub on public.reviews(product_id, status, created_at desc) where kind = 'product';
create index if not exists reviews_kind_status on public.reviews(kind, status, created_at desc);
create index if not exists reviews_order on public.reviews(order_id);
create index if not exists reviews_email on public.reviews(lower(customer_email));
grant select, insert, update, delete on public.reviews to authenticated; grant all on public.reviews to service_role;
alter table public.reviews enable row level security;
create policy "admin reviews" on public.reviews for all to authenticated using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));
create trigger reviews_updated before update on public.reviews for each row execute function public.set_updated_at();

insert into public.site_settings(key, value) values ('reviews', '{"auto_publish": true}')
on conflict (key) do update set value = excluded.value || public.site_settings.value;

-- Public display name: first name + last initial, never email or phone.
create or replace function public.review_display_name(_name text) returns text language sql immutable set search_path=public as $$
  select case when coalesce(trim(_name),'') = '' then 'PANZUTTI guest'
    else split_part(trim(_name),' ',1) || coalesce(' ' || nullif(left(split_part(trim(_name),' ',2),1),'') || '.', '') end $$;

-- Ratings for product cards (published product reviews only).
create or replace function public.product_ratings() returns table(product_id uuid, avg_rating numeric, review_count int)
language sql stable security definer set search_path=public as $$
  select r.product_id, round(avg(r.rating)::numeric, 1), count(*)::int
  from public.reviews r join public.products p on p.id = r.product_id and p.is_published
  where r.kind = 'product' and r.status = 'published'
  group by r.product_id $$;

create or replace function public.product_review_summary(_product uuid) returns jsonb
language sql stable security definer set search_path=public as $$
  select jsonb_build_object(
    'avg', coalesce(round(avg(rating)::numeric,1),0), 'count', count(*),
    'dist', jsonb_build_object('5', count(*) filter (where rating=5), '4', count(*) filter (where rating=4), '3', count(*) filter (where rating=3), '2', count(*) filter (where rating=2), '1', count(*) filter (where rating=1)))
  from public.reviews where product_id = _product and kind='product' and status='published' $$;

create or replace function public.product_reviews(_product uuid, _sort text default 'recent', _limit int default 5, _offset int default 0)
returns table(id uuid, display_name text, rating smallint, title text, body text, created_at timestamptz, verified boolean)
language sql stable security definer set search_path=public as $$
  select r.id, public.review_display_name(r.customer_name), r.rating, r.title, r.body, r.created_at, r.verified_purchase
  from public.reviews r
  where r.product_id = _product and r.kind = 'product' and r.status = 'published'
  order by case when _sort = 'highest' then r.rating end desc nulls last,
           case when _sort = 'lowest' then r.rating end asc nulls last,
           r.created_at desc
  limit least(greatest(coalesce(_limit,5),1),50) offset greatest(coalesce(_offset,0),0) $$;

-- What a customer can review for an order, plus what they already submitted. Access = the private tracking token.
create or replace function public.order_review_state(_token uuid) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare o record;
begin
  select * into o from public.orders where tracking_token = _token;
  if not found then return null; end if;
  return jsonb_build_object(
    'eligible', o.status = 'completed',
    'fulfillment', o.fulfillment,
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
  if o.user_id is not null then select u.email into email from auth.users u where u.id = o.user_id; end if;

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
    elsif k in ('delivery','delivery_time') then
      if o.fulfillment <> 'delivery' then raise exception 'This order was not delivered'; end if;
      pid := null;
    else
      raise exception 'Unknown review type';
    end if;

    update public.reviews set rating = rt, title = ttl, body = bdy,
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
    'pending', count(*) filter (where status='pending'),
    'published', count(*) filter (where status='published'),
    'hidden', count(*) filter (where status='hidden')) from public.reviews);
end; $$;

revoke execute on function public.submit_order_reviews(uuid, jsonb), public.order_review_state(uuid), public.product_ratings(), public.product_review_summary(uuid), public.product_reviews(uuid, text, int, int), public.admin_review_stats() from public;
grant execute on function public.submit_order_reviews(uuid, jsonb), public.order_review_state(uuid), public.product_ratings(), public.product_review_summary(uuid), public.product_reviews(uuid, text, int, int) to anon, authenticated;
grant execute on function public.admin_review_stats() to authenticated;
grant execute on function public.review_display_name(text) to anon, authenticated;
