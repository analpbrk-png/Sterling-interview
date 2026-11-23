-- Explicit API privileges. Newer Supabase projects do not grant table access to
-- API roles by default. Row level security still decides which rows are visible.
grant usage on schema public to authenticated, service_role;
grant select, insert, update, delete on all tables in schema public to authenticated, service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;
-- Signed-out visitors (anon) get no table access at all.
revoke all on all tables in schema public from anon;
