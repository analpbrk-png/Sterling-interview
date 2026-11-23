-- Minimal stand-ins for the Supabase-managed schemas so migrations can be
-- applied and RLS tested on a plain local Postgres. Not used in production.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create table auth.users (id uuid primary key, email text);
create function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create schema storage;
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql immutable as
  $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
grant usage on schema public, auth, storage to anon, authenticated, service_role;
grant all on storage.objects to authenticated;
-- Vault, extensions schema and realtime publication stand-ins.
create schema extensions;
create schema vault;
create table vault.secrets (id uuid primary key default gen_random_uuid(), secret text, name text, description text);
create function vault.create_secret(new_secret text, new_name text default null, new_description text default '', new_key_id uuid default null)
  returns uuid language sql as $$ insert into vault.secrets (secret, name, description) values (new_secret, new_name, new_description) returning id $$;
create function vault.update_secret(secret_id uuid, new_secret text default null, new_name text default null, new_description text default null, new_key_id uuid default null)
  returns void language sql as $$ update vault.secrets set secret = coalesce(new_secret, secret) where id = secret_id $$;
create view vault.decrypted_secrets as select id, name, secret as decrypted_secret from vault.secrets;
create publication supabase_realtime;
