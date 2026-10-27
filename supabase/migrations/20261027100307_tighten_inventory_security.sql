-- Keep the authorization helper out of the exposed Data API schema.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

drop policy if exists "Admins manage profiles" on public.profiles;
drop policy if exists "Managers manage suppliers" on public.suppliers;
drop policy if exists "Team can add suppliers" on public.suppliers;
drop policy if exists "Team can add inventory" on public.inventory_items;
drop policy if exists "Team can update inventory" on public.inventory_items;
drop policy if exists "Managers can delete inventory" on public.inventory_items;
drop policy if exists "Admins can view audit logs" on public.audit_logs;

drop function if exists private.current_user_role();
create function private.current_user_role() returns public.team_role
language sql stable security definer set search_path = public
as $$ select role from public.profiles where id = auth.uid() $$;
revoke all on function private.current_user_role() from public, anon;
grant execute on function private.current_user_role() to authenticated;
drop function public.current_user_role();

alter function public.touch_updated_at() set search_path = public;
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.log_inventory_change() from public, anon, authenticated;
revoke all on function public.touch_updated_at() from public, anon, authenticated;

create policy "Admins insert profiles" on public.profiles for insert to authenticated
with check (private.current_user_role() = 'admin');
create policy "Admins update profiles" on public.profiles for update to authenticated
using (private.current_user_role() = 'admin') with check (private.current_user_role() = 'admin');
create policy "Admins delete profiles" on public.profiles for delete to authenticated
using (private.current_user_role() = 'admin');

create policy "Team can add suppliers" on public.suppliers for insert to authenticated
with check (private.current_user_role() in ('admin','warehouse_staff','store_manager'));
create policy "Managers update suppliers" on public.suppliers for update to authenticated
using (private.current_user_role() in ('admin','store_manager'))
with check (private.current_user_role() in ('admin','store_manager'));
create policy "Managers delete suppliers" on public.suppliers for delete to authenticated
using (private.current_user_role() in ('admin','store_manager'));

create policy "Team can add inventory" on public.inventory_items for insert to authenticated
with check (private.current_user_role() in ('admin','warehouse_staff','store_manager'));
create policy "Team can update inventory" on public.inventory_items for update to authenticated
using (private.current_user_role() in ('admin','warehouse_staff','store_manager'))
with check (private.current_user_role() in ('admin','warehouse_staff','store_manager'));
create policy "Managers can delete inventory" on public.inventory_items for delete to authenticated
using (private.current_user_role() in ('admin','store_manager'));
create policy "Admins can view audit logs" on public.audit_logs for select to authenticated
using (private.current_user_role() = 'admin');

create index if not exists audit_logs_actor_idx on public.audit_logs(actor_id);
