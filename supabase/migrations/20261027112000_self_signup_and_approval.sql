-- Self-service registration with safe, admin-controlled workspace access.
alter table public.profiles
  add column is_active boolean not null default false;

-- Keep existing team members working while requiring approval for new accounts.
update public.profiles set is_active = true;

-- This project currently has one invited account. Bootstrap it as the first Admin
-- so setup does not require the owner to run a manual SQL update.
do $$
declare profile_count integer;
begin
  perform pg_advisory_xact_lock(24117, hashtext('freshstock:first-admin-bootstrap'));
  select count(*) into profile_count from public.profiles;
  if profile_count = 1 and not exists (select 1 from public.profiles where role = 'admin') then
    update public.profiles set role = 'admin', is_active = true;
  end if;
end;
$$;

create or replace function private.current_user_is_active()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and is_active = true
  )
$$;
revoke all on function private.current_user_is_active() from public, anon;
grant execute on function private.current_user_is_active() to authenticated;

-- Ignore all role metadata supplied by a signup form. New accounts are
-- warehouse staff and remain inactive until an existing Admin approves them.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles(id, full_name, email, role, is_active)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    new.email,
    'warehouse_staff',
    false
  )
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;
revoke all on function public.handle_new_user() from public, anon, authenticated;

-- The signed-in member can see their own profile; only an active Admin can
-- list the rest of the team or change roles and approval status.
drop policy if exists "Team can view profiles" on public.profiles;
drop policy if exists "Admins insert profiles" on public.profiles;
drop policy if exists "Admins update profiles" on public.profiles;
drop policy if exists "Admins delete profiles" on public.profiles;
create policy "Users can view own profile" on public.profiles for select to authenticated
  using (id = auth.uid());
create policy "Active admins can view profiles" on public.profiles for select to authenticated
  using (private.current_user_is_active() and private.current_user_role() = 'admin');
create policy "Active admins can insert profiles" on public.profiles for insert to authenticated
  with check (private.current_user_is_active() and private.current_user_role() = 'admin');
create policy "Active admins can update profiles" on public.profiles for update to authenticated
  using (private.current_user_is_active() and private.current_user_role() = 'admin')
  with check (private.current_user_is_active() and private.current_user_role() = 'admin');
create policy "Active admins can delete profiles" on public.profiles for delete to authenticated
  using (private.current_user_is_active() and private.current_user_role() = 'admin');

drop policy if exists "Team can view suppliers" on public.suppliers;
drop policy if exists "Team can add suppliers" on public.suppliers;
drop policy if exists "Managers update suppliers" on public.suppliers;
drop policy if exists "Managers delete suppliers" on public.suppliers;
create policy "Active team can view suppliers" on public.suppliers for select to authenticated
  using (private.current_user_is_active());
create policy "Active team can add suppliers" on public.suppliers for insert to authenticated
  with check (private.current_user_is_active() and private.current_user_role() in ('admin','warehouse_staff','store_manager'));
create policy "Active managers update suppliers" on public.suppliers for update to authenticated
  using (private.current_user_is_active() and private.current_user_role() in ('admin','store_manager'))
  with check (private.current_user_is_active() and private.current_user_role() in ('admin','store_manager'));
create policy "Active managers delete suppliers" on public.suppliers for delete to authenticated
  using (private.current_user_is_active() and private.current_user_role() in ('admin','store_manager'));

drop policy if exists "Team can view inventory" on public.inventory_items;
drop policy if exists "Team can add inventory" on public.inventory_items;
drop policy if exists "Team can update inventory" on public.inventory_items;
drop policy if exists "Managers can delete inventory" on public.inventory_items;
create policy "Active team can view inventory" on public.inventory_items for select to authenticated
  using (private.current_user_is_active());
create policy "Active team can add inventory" on public.inventory_items for insert to authenticated
  with check (private.current_user_is_active() and private.current_user_role() in ('admin','warehouse_staff','store_manager'));
create policy "Active team can update inventory" on public.inventory_items for update to authenticated
  using (private.current_user_is_active() and private.current_user_role() in ('admin','warehouse_staff','store_manager'))
  with check (private.current_user_is_active() and private.current_user_role() in ('admin','warehouse_staff','store_manager'));
create policy "Active managers delete inventory" on public.inventory_items for delete to authenticated
  using (private.current_user_is_active() and private.current_user_role() in ('admin','store_manager'));

drop policy if exists "Admins can view audit logs" on public.audit_logs;
create policy "Active admins can view audit logs" on public.audit_logs for select to authenticated
  using (private.current_user_is_active() and private.current_user_role() = 'admin');

create or replace function private.enforce_inventory_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare actor_role public.team_role;
begin
  if not private.current_user_is_active() then
    raise exception 'An approved team account is required to update inventory';
  end if;
  actor_role := private.current_user_role();
  if actor_role is null then
    raise exception 'A valid team role is required to update inventory';
  end if;
  if actor_role = 'warehouse_staff' and (
    new.sku is distinct from old.sku or
    new.name is distinct from old.name or
    new.category is distinct from old.category or
    new.supplier_id is distinct from old.supplier_id or
    new.price is distinct from old.price or
    new.markdown_price is distinct from old.markdown_price or
    new.reorder_point is distinct from old.reorder_point
  ) then
    raise exception 'Warehouse Staff may update quantities and batch dates, but not product, supplier, or pricing fields';
  end if;
  return new;
end;
$$;
revoke all on function private.enforce_inventory_role() from public, anon, authenticated;
