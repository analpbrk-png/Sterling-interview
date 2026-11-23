-- AI Interview Prep: initial schema.
-- Practice tool only. No audio or video is ever stored by this schema: there is
-- deliberately no table or bucket for recordings.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Enumerations
-- ---------------------------------------------------------------------------
create type public.app_role as enum ('student', 'admin');
create type public.document_kind as enum ('resume', 'passport', 'course_document');
create type public.question_origin as enum ('imported', 'manual', 'ai_generated');
create type public.question_type as enum ('question', 'identity_instruction', 'pronunciation', 'declaration');
create type public.review_status as enum ('pending_review', 'approved', 'rejected');
create type public.submission_mode as enum ('manual', 'automatic');
create type public.session_status as enum ('ready', 'in_progress', 'completed', 'abandoned');
create type public.session_question_state as enum
  ('pending', 'preparing', 'answering', 'awaiting_submit', 'completed', 'timed_out');

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Users and roles
-- ---------------------------------------------------------------------------
create table public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  role public.app_role not null default 'student',
  created_at timestamptz not null default now()
);

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.users where id = auth.uid() and role = 'admin');
$$;

-- Mirror new auth users. Everyone starts as a student; admins are promoted by SQL.
create or replace function public.handle_new_auth_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.users (id, email) values (new.id, coalesce(new.email, ''))
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- ---------------------------------------------------------------------------
-- Student profile and documents
-- ---------------------------------------------------------------------------
create table public.student_profiles (
  user_id uuid primary key references public.users (id) on delete cascade,
  full_name text not null check (char_length(full_name) between 1 and 120),
  student_id text not null check (char_length(student_id) between 1 and 60),
  email text not null check (char_length(email) between 3 and 200),
  target_country text not null default 'UK',
  intake text check (intake is null or char_length(intake) <= 40),
  previous_qualification text check (previous_qualification is null or char_length(previous_qualification) <= 200),
  -- Minimal, student-reviewed context used for personalisation. Raw CV text is never stored.
  resume_context jsonb not null default '{}'::jsonb,
  resume_context_status text not null default 'none'
    check (resume_context_status in ('none', 'draft', 'confirmed')),
  resume_extraction_mode text check (resume_extraction_mode in ('ai', 'basic')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger student_profiles_touch before update on public.student_profiles
  for each row execute function public.touch_updated_at();

create table public.student_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  kind public.document_kind not null,
  application_id uuid,
  storage_path text not null unique,
  file_name text not null check (char_length(file_name) <= 255),
  mime_type text not null,
  size_bytes integer not null check (size_bytes > 0 and size_bytes <= 10485760),
  created_at timestamptz not null default now(),
  -- The object must sit in the owner's folder.
  check (split_part(storage_path, '/', 1) = user_id::text)
);
create index student_documents_user_idx on public.student_documents (user_id, kind);
-- One current CV and one passport per student; replacing means delete + insert.
create unique index student_documents_single_resume
  on public.student_documents (user_id, kind) where kind in ('resume', 'passport');

-- ---------------------------------------------------------------------------
-- Universities, courses and verified course facts
-- ---------------------------------------------------------------------------
create table public.universities (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(name) between 2 and 160),
  country text not null default 'UK',
  city text,
  website text,
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger universities_touch before update on public.universities
  for each row execute function public.touch_updated_at();

create table public.courses (
  id uuid primary key default gen_random_uuid(),
  university_id uuid not null references public.universities (id) on delete cascade,
  name text not null check (char_length(name) between 2 and 200),
  level text,
  description text,
  official_url text,
  modules text[] not null default '{}',
  is_verified boolean not null default false,
  verified_at timestamptz,
  verified_by uuid references public.users (id) on delete set null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (university_id, name),
  unique (id, university_id)
);
create index courses_university_idx on public.courses (university_id);
create trigger courses_touch before update on public.courses
  for each row execute function public.touch_updated_at();

create table public.university_course_details (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses (id) on delete cascade,
  kind text not null check (kind in ('campus', 'facilities', 'assessment', 'teaching', 'entry_requirements', 'other')),
  content text not null check (char_length(content) between 2 and 4000),
  source_url text,
  is_verified boolean not null default false,
  created_at timestamptz not null default now()
);
create index ucd_course_idx on public.university_course_details (course_id);

-- ---------------------------------------------------------------------------
-- Question bank
-- ---------------------------------------------------------------------------
create table public.question_categories (
  id text primary key check (id ~ '^[a-z0-9_]{2,40}$'),
  name text not null,
  sort_order integer not null default 100,
  is_system boolean not null default false
);

create table public.question_sources (
  id uuid primary key default gen_random_uuid(),
  file_name text not null,
  kind text not null check (kind in ('pdf', 'manual', 'ai')),
  page_count integer,
  notes text,
  imported_by uuid references public.users (id) on delete set null,
  imported_at timestamptz not null default now()
);

create table public.question_bank (
  id uuid primary key default gen_random_uuid(),
  question_text text not null check (char_length(question_text) between 5 and 1200),
  source_text text,                      -- original wording, never edited
  source_id uuid references public.question_sources (id) on delete set null,
  source_file text,
  source_page integer check (source_page is null or source_page > 0),
  origin public.question_origin not null,
  question_type public.question_type not null default 'question',
  category_id text not null references public.question_categories (id),
  country text not null default 'UK',
  -- Empty array = any university in the country. Non-empty = only these.
  applicable_university_ids uuid[] not null default '{}',
  mentions_university text,              -- detected university name in the wording
  prep_seconds integer check (prep_seconds is null or prep_seconds between 0 and 600),
  answer_seconds integer check (answer_seconds is null or answer_seconds between 10 and 900),
  submission_mode public.submission_mode,
  is_mandatory boolean not null default false,
  is_sensitive boolean not null default false,
  sensitivity_reason text,
  is_active boolean not null default false,
  review_status public.review_status not null default 'pending_review',
  review_notes text,
  similarity_group text,                 -- questions judged equivalent share a group
  duplicate_of uuid references public.question_bank (id) on delete set null,
  generated_for_course uuid references public.courses (id) on delete set null,
  created_by uuid references public.users (id) on delete set null,
  reviewed_by uuid references public.users (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Only reviewed, approved questions may be shown to students.
  check (not is_active or review_status = 'approved'),
  -- A question naming a specific university must be restricted to universities.
  check (mentions_university is null or cardinality(applicable_university_ids) > 0 or not is_active)
);
create index question_bank_active_idx on public.question_bank (country, is_active, category_id);
create index question_bank_review_idx on public.question_bank (review_status, created_at desc);
create index question_bank_group_idx on public.question_bank (similarity_group);
create unique index question_bank_source_unique
  on public.question_bank (source_file, source_page, question_type)
  where origin = 'imported';
create trigger question_bank_touch before update on public.question_bank
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Interview templates
-- ---------------------------------------------------------------------------
create table public.interview_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 120),
  country text not null default 'UK',
  university_id uuid references public.universities (id) on delete cascade,
  is_default boolean not null default false,
  identity_enabled boolean not null default true,     -- camera check + passport practice
  name_id_step_enabled boolean not null default true,
  pronunciation_enabled boolean not null default true,
  pronunciation_words text[] not null default '{}',
  declaration_enabled boolean not null default true,
  declaration_text text,
  prep_seconds integer not null default 20 check (prep_seconds between 0 and 600),
  answer_seconds integer not null default 60 check (answer_seconds between 10 and 900),
  submission_mode public.submission_mode not null default 'automatic',
  allow_early_submit boolean not null default true,
  question_count integer not null default 12 check (question_count between 1 and 40),
  ai_question_count integer not null default 4 check (ai_question_count between 0 and 20),
  include_sensitive boolean not null default false,
  tts_default boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ai_question_count <= question_count)
);
create unique index interview_templates_one_default
  on public.interview_templates (country) where is_default and university_id is null;
create unique index interview_templates_one_per_university
  on public.interview_templates (university_id) where university_id is not null;
create trigger interview_templates_touch before update on public.interview_templates
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Student applications (one row per university + course combination)
-- ---------------------------------------------------------------------------
create table public.student_applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  university_id uuid not null references public.universities (id) on delete restrict,
  course_id uuid not null,
  intake text check (intake is null or char_length(intake) <= 40),
  created_at timestamptz not null default now(),
  -- The course must belong to the chosen university (prevents mixed context).
  foreign key (course_id, university_id) references public.courses (id, university_id) on delete restrict,
  unique (user_id, course_id)
);
create index student_applications_user_idx on public.student_applications (user_id);

alter table public.student_documents
  add constraint student_documents_application_fk
  foreign key (application_id) references public.student_applications (id) on delete cascade;

-- ---------------------------------------------------------------------------
-- Interview sessions (metadata only; no media)
-- ---------------------------------------------------------------------------
create table public.interview_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  application_id uuid references public.student_applications (id) on delete set null,
  template_id uuid references public.interview_templates (id) on delete set null,
  university_name text not null,
  course_name text not null,
  status public.session_status not null default 'ready',
  generation_mode text not null check (generation_mode in ('bank_and_ai', 'bank_only')),
  generation_notice text,
  config jsonb not null,                -- snapshot of template settings at creation
  question_count integer not null check (question_count > 0),
  current_position integer not null default 0,
  started_at timestamptz,
  completed_at timestamptz,
  duration_seconds integer,
  created_at timestamptz not null default now()
);
create index interview_sessions_user_idx on public.interview_sessions (user_id, created_at desc);
create index interview_sessions_application_idx on public.interview_sessions (application_id, created_at desc);

create table public.interview_session_questions (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.interview_sessions (id) on delete cascade,
  position integer not null check (position >= 0),
  question_id uuid references public.question_bank (id) on delete set null,
  question_text text not null,
  origin public.question_origin not null,
  category_id text references public.question_categories (id),
  prep_seconds integer not null check (prep_seconds between 0 and 600),
  answer_seconds integer not null check (answer_seconds between 10 and 900),
  submission_mode public.submission_mode not null,
  state public.session_question_state not null default 'pending',
  completion_method text check (completion_method in ('manual', 'automatic', 'early')),
  presented_at timestamptz,
  answer_started_at timestamptz,
  completed_at timestamptz,
  unique (session_id, position)
);

create table public.interview_events (
  id bigint generated always as identity primary key,
  session_id uuid not null references public.interview_sessions (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  event_type text not null check (char_length(event_type) <= 60),
  position integer,
  payload jsonb not null default '{}'::jsonb,
  client_ts timestamptz,
  created_at timestamptz not null default now()
);
create index interview_events_session_idx on public.interview_events (session_id, id);

-- ---------------------------------------------------------------------------
-- Admin settings (no secrets live here; API keys stay in server env vars)
-- ---------------------------------------------------------------------------
create table public.admin_settings (
  key text primary key check (key ~ '^[a-z0-9_]{2,60}$'),
  value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.users (id) on delete set null
);

-- ---------------------------------------------------------------------------
-- Session progress: the only way a student changes session rows.
-- Transitions only move forward, so retries and duplicate calls are harmless.
-- ---------------------------------------------------------------------------
create or replace function public.session_state_rank(s public.session_question_state)
returns integer language sql immutable as $$
  select case s
    when 'pending' then 0 when 'preparing' then 1 when 'answering' then 2
    when 'awaiting_submit' then 3 when 'completed' then 4 when 'timed_out' then 4 end;
$$;

create or replace function public.record_session_progress(
  p_session uuid,
  p_position integer,
  p_state public.session_question_state,
  p_method text default null,
  p_client_ts timestamptz default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_session public.interview_sessions;
  v_q public.interview_session_questions;
  v_applied boolean := false;
begin
  select * into v_session from public.interview_sessions where id = p_session for update;
  if v_session.id is null or v_session.user_id <> auth.uid() then
    raise exception 'session not found' using errcode = 'P0002';
  end if;
  if v_session.status in ('completed', 'abandoned') then
    return jsonb_build_object('applied', false, 'reason', 'session_closed');
  end if;
  if p_method is not null and p_method not in ('manual', 'automatic', 'early') then
    raise exception 'invalid method';
  end if;

  select * into v_q from public.interview_session_questions
    where session_id = p_session and position = p_position for update;
  if v_q.id is null then
    raise exception 'question not found' using errcode = 'P0002';
  end if;

  -- A later question cannot start while an earlier one is unfinished.
  if p_state <> 'pending' and exists (
    select 1 from public.interview_session_questions
    where session_id = p_session and position < p_position
      and state not in ('completed', 'timed_out')
  ) then
    raise exception 'previous question not finished';
  end if;

  if public.session_state_rank(p_state) > public.session_state_rank(v_q.state) then
    update public.interview_session_questions set
      state = p_state,
      presented_at = coalesce(presented_at, now()),
      answer_started_at = case when public.session_state_rank(p_state) >= 2 then coalesce(answer_started_at, now()) else answer_started_at end,
      completed_at = case when p_state in ('completed', 'timed_out') then now() else completed_at end,
      completion_method = case when p_state in ('completed', 'timed_out') then coalesce(p_method, completion_method) else completion_method end
    where id = v_q.id;
    v_applied := true;

    update public.interview_sessions set
      status = 'in_progress',
      started_at = coalesce(started_at, now()),
      current_position = greatest(current_position,
        case when p_state in ('completed', 'timed_out') then p_position + 1 else p_position end)
    where id = p_session;

    insert into public.interview_events (session_id, user_id, event_type, position, payload, client_ts)
    values (p_session, auth.uid(), 'question_' || p_state::text, p_position,
            jsonb_build_object('method', p_method), p_client_ts);
  end if;

  return jsonb_build_object('applied', v_applied);
end $$;

create or replace function public.complete_session(p_session uuid) returns public.interview_sessions
language plpgsql security definer set search_path = public as $$
declare
  v_session public.interview_sessions;
begin
  select * into v_session from public.interview_sessions where id = p_session for update;
  if v_session.id is null or v_session.user_id <> auth.uid() then
    raise exception 'session not found' using errcode = 'P0002';
  end if;
  if v_session.status = 'completed' then
    return v_session;
  end if;
  if exists (select 1 from public.interview_session_questions
             where session_id = p_session and state not in ('completed', 'timed_out')) then
    raise exception 'unanswered questions remain';
  end if;
  update public.interview_sessions set
    status = 'completed',
    completed_at = now(),
    current_position = question_count,
    duration_seconds = greatest(0, extract(epoch from (now() - coalesce(started_at, created_at)))::integer)
  where id = p_session
  returning * into v_session;
  insert into public.interview_events (session_id, user_id, event_type)
    values (p_session, auth.uid(), 'session_completed');
  return v_session;
end $$;

create or replace function public.abandon_session(p_session uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.interview_sessions set status = 'abandoned'
  where id = p_session and user_id = auth.uid() and status in ('ready', 'in_progress');
  if found then
    insert into public.interview_events (session_id, user_id, event_type)
      values (p_session, auth.uid(), 'session_abandoned');
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
alter table public.users enable row level security;
alter table public.student_profiles enable row level security;
alter table public.student_documents enable row level security;
alter table public.universities enable row level security;
alter table public.courses enable row level security;
alter table public.university_course_details enable row level security;
alter table public.question_categories enable row level security;
alter table public.question_sources enable row level security;
alter table public.question_bank enable row level security;
alter table public.interview_templates enable row level security;
alter table public.student_applications enable row level security;
alter table public.interview_sessions enable row level security;
alter table public.interview_session_questions enable row level security;
alter table public.interview_events enable row level security;
alter table public.admin_settings enable row level security;

-- users: read self (admins read all); only admins change roles.
create policy users_select on public.users for select to authenticated
  using (id = auth.uid() or public.is_admin());
create policy users_admin_update on public.users for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- profiles
create policy profiles_own on public.student_profiles for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy profiles_admin_read on public.student_profiles for select to authenticated
  using (public.is_admin());
create policy profiles_admin_delete on public.student_profiles for delete to authenticated
  using (public.is_admin());

-- documents: owners only. Admins see metadata (not files) to manage retention.
create policy documents_own_select on public.student_documents for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
create policy documents_own_insert on public.student_documents for insert to authenticated
  with check (user_id = auth.uid());
create policy documents_own_delete on public.student_documents for delete to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- reference data: readable by signed-in users, writable by admins.
create policy universities_read on public.universities for select to authenticated using (is_active or public.is_admin());
create policy universities_admin on public.universities for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy courses_read on public.courses for select to authenticated using (is_active or public.is_admin());
create policy courses_admin on public.courses for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy ucd_admin on public.university_course_details for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy categories_read on public.question_categories for select to authenticated using (true);
create policy categories_admin on public.question_categories for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy templates_read on public.interview_templates for select to authenticated using (true);
create policy templates_admin on public.interview_templates for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy settings_read on public.admin_settings for select to authenticated using (true);
create policy settings_admin on public.admin_settings for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- question bank and sources: admins only (students receive questions inside a session).
create policy question_bank_admin on public.question_bank for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy question_sources_admin on public.question_sources for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- applications
create policy applications_own on public.student_applications for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy applications_admin_read on public.student_applications for select to authenticated
  using (public.is_admin());

-- sessions: students read their own; writes go through the functions above
-- (creation happens server-side after authorisation checks).
create policy sessions_read on public.interview_sessions for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
create policy session_questions_read on public.interview_session_questions for select to authenticated
  using (exists (select 1 from public.interview_sessions s
                 where s.id = session_id and (s.user_id = auth.uid() or public.is_admin())));
create policy events_read on public.interview_events for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
create policy events_insert on public.interview_events for insert to authenticated
  with check (user_id = auth.uid() and exists (
    select 1 from public.interview_sessions s where s.id = session_id and s.user_id = auth.uid()));

revoke all on function public.record_session_progress(uuid, integer, public.session_question_state, text, timestamptz) from public, anon;
revoke all on function public.complete_session(uuid) from public, anon;
revoke all on function public.abandon_session(uuid) from public, anon;
grant execute on function public.record_session_progress(uuid, integer, public.session_question_state, text, timestamptz) to authenticated;
grant execute on function public.complete_session(uuid) to authenticated;
grant execute on function public.abandon_session(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Private storage for student documents
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('student-documents', 'student-documents', false, 10485760, array[
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/jpeg', 'image/png'
])
on conflict (id) do update set public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "student documents: owner read" on storage.objects for select to authenticated
  using (bucket_id = 'student-documents' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "student documents: owner insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'student-documents' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "student documents: owner delete" on storage.objects for delete to authenticated
  using (bucket_id = 'student-documents' and (storage.foldername(name))[1] = auth.uid()::text);
