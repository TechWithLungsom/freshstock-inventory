-- Support invited team accounts and server-enforced role permissions.
alter table public.profiles add column email text;
create unique index profiles_email_unique on public.profiles(email) where email is not null;

update public.profiles as p
set email = u.email
from auth.users as u
where p.id = u.id and p.email is null;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles(id, full_name, email)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', ''), new.email)
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;
revoke all on function public.handle_new_user() from public, anon, authenticated;

create or replace function private.enforce_inventory_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_role public.team_role;
begin
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
create trigger inventory_role_guard
before update on public.inventory_items
for each row execute function private.enforce_inventory_role();
