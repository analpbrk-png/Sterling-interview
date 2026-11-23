-- Support a static (GitHub Pages) frontend: operations that previously needed
-- the server's service-role key now run as checked database functions.

-- A student deletes their own account. Their files must be removed from storage
-- by the client first (storage objects are not deleted from SQL).
create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = public, auth as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  delete from auth.users where id = auth.uid();
end $$;

-- An admin deletes a student account (cascades to every related row).
create or replace function public.admin_delete_user(p_user uuid) returns void
language plpgsql security definer set search_path = public, auth as $$
begin
  if not public.is_admin() then raise exception 'admins only'; end if;
  if p_user = auth.uid() then raise exception 'cannot delete yourself'; end if;
  delete from auth.users where id = p_user;
end $$;

revoke all on function public.delete_my_account() from public, anon;
revoke all on function public.admin_delete_user(uuid) from public, anon;
grant execute on function public.delete_my_account() to authenticated;
grant execute on function public.admin_delete_user(uuid) to authenticated;

-- Admins may delete (never read) student files, for account removal and retention.
create policy "student documents: admin delete" on storage.objects for delete to authenticated
  using (bucket_id = 'student-documents' and public.is_admin());
