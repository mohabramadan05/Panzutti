alter table public.products
  add column if not exists prep_minutes int not null default 10 check (prep_minutes between 0 and 240),
  add column if not exists is_bestseller boolean not null default false,
  add column if not exists name_ar text,
  add column if not exists short_description text;
alter table public.delivery_zones alter column eta_minutes drop not null;
alter table public.delivery_zones alter column eta_minutes drop default;
insert into public.site_settings(key, value) values
 ('timing', '{"calc_rule":"longest","prep_buffer_minutes":5,"per_extra_item_minutes":1,"delivery_minutes":30,"dispatch_buffer_minutes":5,"pickup_min_advance_minutes":0,"pickup_max_days":2,"slot_minutes":15,"pickup_capacity_per_slot":0,"orders_enabled":true,"temporarily_closed":false,"closed_message":"","delivery_start":"","delivery_end":"","pickup_start":"","pickup_end":""}')
on conflict (key) do update set value = excluded.value || public.site_settings.value;
insert into public.site_settings(key, value) values
 ('location', '{"lat":"","lng":""}'),
 ('ordering', '{"dine_in_enabled":true}')
on conflict (key) do update set value = excluded.value || public.site_settings.value;
create table if not exists public.drivers (
  id uuid primary key default gen_random_uuid(),
  full_name text not null check (length(trim(full_name)) > 0),
  phone text not null check (length(trim(phone)) >= 6),
  photo_url text,
  is_active boolean not null default true,
  is_available boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.drivers to authenticated; grant all on public.drivers to service_role;
alter table public.drivers enable row level security;
create policy "admin drivers" on public.drivers for all to authenticated using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));
create trigger drivers_updated before update on public.drivers for each row execute function public.set_updated_at();
alter table public.orders alter column user_id drop not null;
alter table public.orders
  add column if not exists tracking_token uuid not null default gen_random_uuid(),
  add column if not exists client_request_id uuid,
  add column if not exists driver_id uuid references public.drivers(id) on delete set null,
  add column if not exists prep_minutes int,
  add column if not exists estimated_ready_at timestamptz,
  add column if not exists estimated_delivery_at timestamptz,
  add column if not exists estimate_note text,
  add column if not exists cancel_reason text,
  add column if not exists delivery_notes text,
  add column if not exists lat numeric(9,6),
  add column if not exists lng numeric(9,6),
  add column if not exists table_number text;
create unique index if not exists orders_tracking_token on public.orders(tracking_token);
create unique index if not exists orders_client_request on public.orders(client_request_id) where client_request_id is not null;
create index if not exists orders_status on public.orders(status);
create index if not exists orders_created on public.orders(created_at desc);
create index if not exists orders_pickup_slot on public.orders(scheduled_for) where fulfillment = 'pickup';
create index if not exists orders_phone_recent on public.orders(phone, created_at);
create index if not exists orders_driver on public.orders(driver_id);
alter table public.order_status_history add column if not exists note text;
create index if not exists order_history_order on public.order_status_history(order_id, created_at);
create table if not exists public.driver_assignments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  driver_id uuid not null references public.drivers(id) on delete restrict,
  assigned_by uuid,
  assigned_at timestamptz not null default now(),
  unassigned_at timestamptz,
  reason text
);
grant select on public.driver_assignments to authenticated; grant all on public.driver_assignments to service_role;
alter table public.driver_assignments enable row level security;
create policy "admin assignments read" on public.driver_assignments for select to authenticated using (public.has_role(auth.uid(),'admin'));
create index if not exists driver_assignments_order on public.driver_assignments(order_id);
create index if not exists driver_assignments_driver on public.driver_assignments(driver_id, assigned_at desc);
create table if not exists public.order_notifications (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  event text not null,
  channel text not null default 'pending_channel',
  status text not null default 'queued' check (status in ('queued','sent','failed','skipped')),
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
grant select on public.order_notifications to authenticated; grant all on public.order_notifications to service_role;
alter table public.order_notifications enable row level security;
create policy "admin notifications read" on public.order_notifications for select to authenticated using (public.has_role(auth.uid(),'admin'));
