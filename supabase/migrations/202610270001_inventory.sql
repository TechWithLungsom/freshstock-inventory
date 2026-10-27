-- FreshStock: core inventory schema, roles, audit history and RLS policies.
create extension if not exists pgcrypto;

create type public.team_role as enum ('admin', 'warehouse_staff', 'store_manager');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  role public.team_role not null default 'warehouse_staff',
  created_at timestamptz not null default now()
);

create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  contact_name text,
  email text,
  phone text,
  created_at timestamptz not null default now()
);

create table public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  sku text not null unique,
  name text not null,
  category text not null default 'Other',
  supplier_id uuid references public.suppliers(id) on delete set null,
  quantity integer not null default 0 check (quantity >= 0),
  unit text not null default 'units',
  price numeric(10,2) not null check (price >= 0),
  markdown_price numeric(10,2) check (markdown_price is null or (markdown_price >= 0 and markdown_price <= price)),
  batch_number text not null,
  manufactured_date date,
  expiry_date date not null,
  reorder_point integer not null default 8 check (reorder_point >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  table_name text not null,
  record_id uuid,
  changes jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles(id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', ''))
  on conflict (id) do nothing;
  return new;
end; $$;
create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

create index inventory_expiry_idx on public.inventory_items(expiry_date);
create index inventory_category_idx on public.inventory_items(category);
create index inventory_supplier_idx on public.inventory_items(supplier_id);
create index audit_logs_created_idx on public.audit_logs(created_at desc);

create function public.current_user_role() returns public.team_role
language sql stable security definer set search_path = public
as $$ select role from public.profiles where id = auth.uid() $$;

create function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;
create trigger inventory_touch_updated_at before update on public.inventory_items
for each row execute function public.touch_updated_at();

create function public.log_inventory_change() returns trigger language plpgsql security definer set search_path = public as $$
declare old_data jsonb; new_data jsonb; rid uuid;
begin
  if tg_op <> 'INSERT' then old_data = to_jsonb(old); end if;
  if tg_op <> 'DELETE' then new_data = to_jsonb(new); end if;
  rid = coalesce(new.id, old.id);
  insert into public.audit_logs(actor_id, action, table_name, record_id, changes)
  values (auth.uid(), tg_op, tg_table_name, rid, jsonb_build_object('old', old_data, 'new', new_data));
  return coalesce(new, old);
end; $$;
create trigger inventory_audit after insert or update or delete on public.inventory_items
for each row execute function public.log_inventory_change();

alter table public.profiles enable row level security;
alter table public.suppliers enable row level security;
alter table public.inventory_items enable row level security;
alter table public.audit_logs enable row level security;

create policy "Team can view profiles" on public.profiles for select to authenticated using (true);
create policy "Admins manage profiles" on public.profiles for all to authenticated using (public.current_user_role() = 'admin') with check (public.current_user_role() = 'admin');
create policy "Team can view suppliers" on public.suppliers for select to authenticated using (true);
create policy "Managers manage suppliers" on public.suppliers for all to authenticated using (public.current_user_role() in ('admin','store_manager')) with check (public.current_user_role() in ('admin','store_manager'));
create policy "Team can add suppliers" on public.suppliers for insert to authenticated with check (public.current_user_role() in ('admin','warehouse_staff','store_manager'));
create policy "Team can view inventory" on public.inventory_items for select to authenticated using (true);
create policy "Team can add inventory" on public.inventory_items for insert to authenticated with check (public.current_user_role() in ('admin','warehouse_staff','store_manager'));
create policy "Team can update inventory" on public.inventory_items for update to authenticated using (public.current_user_role() in ('admin','warehouse_staff','store_manager')) with check (public.current_user_role() in ('admin','warehouse_staff','store_manager'));
create policy "Managers can delete inventory" on public.inventory_items for delete to authenticated using (public.current_user_role() in ('admin','store_manager'));
create policy "Admins can view audit logs" on public.audit_logs for select to authenticated using (public.current_user_role() = 'admin');

alter publication supabase_realtime add table public.inventory_items;
