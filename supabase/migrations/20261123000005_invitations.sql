-- Invitation-based interviews: students never sign in.
-- Admins create an invitation; the student opens a secret link. The link token
-- is stored only as a SHA-256 hash (for validation) plus an encrypted copy in
-- Supabase Vault (so admins can copy the link again). Students never touch the
-- database directly: every student action goes through an Edge Function that
-- validates the token, using the service-role-only functions below.

-- ---------------------------------------------------------------------------
-- Remove the student self-service model (accounts, profiles, applications)
-- ---------------------------------------------------------------------------
delete from public.interview_sessions;               -- test data only
drop table if exists public.student_applications cascade;
drop table if exists public.student_profiles cascade;
drop table if exists public.student_documents cascade;
drop function if exists public.delete_my_account();
drop function if exists public.record_session_progress(uuid, integer, public.session_question_state, text, timestamptz);
drop function if exists public.complete_session(uuid);
drop function if exists public.abandon_session(uuid);

drop policy if exists "student documents: owner read" on storage.objects;
drop policy if exists "student documents: owner insert" on storage.objects;
drop policy if exists "student documents: owner delete" on storage.objects;
drop policy if exists "student documents: admin delete" on storage.objects;

-- ---------------------------------------------------------------------------
-- Invitations
-- ---------------------------------------------------------------------------
create table public.interview_invitations (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  token_secret_id uuid,                       -- Vault secret holding the link token
  student_name text not null check (char_length(student_name) between 1 and 120),
  student_ref text not null check (char_length(student_ref) between 1 and 60),   -- student ID
  university_id uuid not null references public.universities (id) on delete restrict,
  course_id uuid not null,
  template_id uuid references public.interview_templates (id) on delete set null,
  -- Optional per-student overrides of the template.
  question_count integer check (question_count is null or question_count between 1 and 40),
  ai_question_count integer check (ai_question_count is null or ai_question_count between 0 and 20),
  prep_seconds integer check (prep_seconds is null or prep_seconds between 0 and 600),
  answer_seconds integer check (answer_seconds is null or answer_seconds between 10 and 900),
  submission_mode public.submission_mode,
  allow_early_submit boolean,
  previous_qualification text check (previous_qualification is null or char_length(previous_qualification) <= 200),
  resume_context jsonb not null default '{}'::jsonb,
  resume_context_status text not null default 'none' check (resume_context_status in ('none', 'draft', 'confirmed')),
  resume_extraction_mode text check (resume_extraction_mode in ('ai', 'basic')),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  max_attempts integer not null default 1 check (max_attempts between 1 and 20),
  attempts_used integer not null default 0 check (attempts_used >= 0),
  last_opened_at timestamptz,
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (course_id, university_id) references public.courses (id, university_id) on delete restrict
);
create index invitations_created_idx on public.interview_invitations (created_at desc);
create index invitations_uni_course_idx on public.interview_invitations (university_id, course_id);
create trigger invitations_touch before update on public.interview_invitations
  for each row execute function public.touch_updated_at();

create table public.invitation_documents (
  id uuid primary key default gen_random_uuid(),
  invitation_id uuid not null references public.interview_invitations (id) on delete cascade,
  kind text not null check (kind in ('resume', 'course_document')),
  storage_path text not null unique check (storage_path like 'invitations/%'),
  file_name text not null check (char_length(file_name) <= 255),
  mime_type text not null,
  size_bytes integer not null check (size_bytes > 0 and size_bytes <= 10485760),
  uploaded_by text not null check (uploaded_by in ('admin', 'student')),
  created_at timestamptz not null default now()
);
create unique index invitation_documents_one_resume on public.invitation_documents (invitation_id) where kind = 'resume';

-- Sessions now belong to an invitation instead of a student account.
drop policy if exists sessions_read on public.interview_sessions;
drop policy if exists session_questions_read on public.interview_session_questions;
drop policy if exists events_read on public.interview_events;
drop policy if exists events_insert on public.interview_events;
alter table public.interview_sessions drop column if exists user_id;
alter table public.interview_sessions drop column if exists application_id;
alter table public.interview_sessions add column invitation_id uuid not null references public.interview_invitations (id) on delete cascade;
alter table public.interview_sessions add column last_activity_at timestamptz not null default now();
create index interview_sessions_invitation_idx on public.interview_sessions (invitation_id, created_at desc);
alter table public.interview_events drop column if exists user_id;

-- ---------------------------------------------------------------------------
-- Row level security: invitations and documents are admin-only. Students
-- have no database access at all (Edge Functions use the service role).
-- ---------------------------------------------------------------------------
alter table public.interview_invitations enable row level security;
alter table public.invitation_documents enable row level security;
create policy invitations_admin on public.interview_invitations for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy invitation_documents_admin on public.invitation_documents for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy sessions_admin_read on public.interview_sessions for select to authenticated using (public.is_admin());
create policy session_questions_admin_read on public.interview_session_questions for select to authenticated using (public.is_admin());
create policy events_admin_read on public.interview_events for select to authenticated using (public.is_admin());

grant select, insert, update, delete on public.interview_invitations, public.invitation_documents to authenticated, service_role;

-- Private document storage: admins manage files under invitations/<id>/.
-- Students upload only through the Edge Function (service role).
create policy "invitation documents: admin read" on storage.objects for select to authenticated
  using (bucket_id = 'student-documents' and public.is_admin());
create policy "invitation documents: admin insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'student-documents' and public.is_admin() and (storage.foldername(name))[1] = 'invitations');
create policy "invitation documents: admin delete" on storage.objects for delete to authenticated
  using (bucket_id = 'student-documents' and public.is_admin());

-- ---------------------------------------------------------------------------
-- Token helpers (admin-only, SECURITY DEFINER). Tokens: 32 random bytes,
-- base64url. Only the hash is used for validation.
-- ---------------------------------------------------------------------------
create or replace function public.new_invitation_token() returns text
language sql volatile set search_path = public, extensions as $$
  select translate(rtrim(encode(gen_random_bytes(32), 'base64'), '='), '+/', '-_');
$$;

create or replace function public.hash_invitation_token(p_token text) returns text
language sql immutable set search_path = public, extensions as $$
  select encode(digest(p_token, 'sha256'), 'hex');
$$;

create or replace function public.admin_create_invitation(p jsonb) returns table (id uuid, token text)
language plpgsql security definer set search_path = public, extensions, vault as $$
declare
  v_token text := public.new_invitation_token();
  v_id uuid := gen_random_uuid();
  v_secret uuid;
begin
  if not public.is_admin() then raise exception 'admins only'; end if;
  v_secret := vault.create_secret(v_token, 'invitation-' || v_id::text, 'Interview invitation link token', null);
  insert into public.interview_invitations (
    id, token_hash, token_secret_id, student_name, student_ref, university_id, course_id, template_id,
    question_count, ai_question_count, prep_seconds, answer_seconds, submission_mode, allow_early_submit,
    previous_qualification, expires_at, max_attempts, created_by)
  values (
    v_id, public.hash_invitation_token(v_token), v_secret,
    trim(p->>'student_name'), trim(p->>'student_ref'),
    (p->>'university_id')::uuid, (p->>'course_id')::uuid, nullif(p->>'template_id', '')::uuid,
    nullif(p->>'question_count', '')::int, nullif(p->>'ai_question_count', '')::int,
    nullif(p->>'prep_seconds', '')::int, nullif(p->>'answer_seconds', '')::int,
    nullif(p->>'submission_mode', '')::public.submission_mode, (p->>'allow_early_submit')::boolean,
    nullif(trim(p->>'previous_qualification'), ''),
    now() + make_interval(days => greatest(1, least(365, coalesce((p->>'expires_in_days')::int, 14)))),
    greatest(1, least(20, coalesce((p->>'max_attempts')::int, 1))),
    auth.uid());
  return query select v_id, v_token;
end $$;

create or replace function public.admin_invitation_token(p_id uuid) returns text
language plpgsql security definer set search_path = public, vault as $$
declare v_token text;
begin
  if not public.is_admin() then raise exception 'admins only'; end if;
  select s.decrypted_secret into v_token
  from public.interview_invitations i join vault.decrypted_secrets s on s.id = i.token_secret_id
  where i.id = p_id;
  return v_token;
end $$;

create or replace function public.admin_regenerate_invitation(p_id uuid) returns text
language plpgsql security definer set search_path = public, extensions, vault as $$
declare
  v_token text := public.new_invitation_token();
  v_inv public.interview_invitations;
begin
  if not public.is_admin() then raise exception 'admins only'; end if;
  select * into v_inv from public.interview_invitations where id = p_id for update;
  if v_inv.id is null then raise exception 'not found'; end if;
  if v_inv.token_secret_id is null then
    v_inv.token_secret_id := vault.create_secret(v_token, 'invitation-' || p_id::text || '-' || extract(epoch from now())::bigint, 'Interview invitation link token', null);
  else
    perform vault.update_secret(v_inv.token_secret_id, v_token, null, null, null);
  end if;
  update public.interview_invitations
    set token_hash = public.hash_invitation_token(v_token), token_secret_id = v_inv.token_secret_id, revoked_at = null
  where id = p_id;
  return v_token;
end $$;

-- ---------------------------------------------------------------------------
-- Server-validated progress (service role only; called by the Edge Function
-- after it has matched the link token to p_invitation). Transitions only move
-- forward and are checked against the server clock, so a refresh or a
-- tampered client cannot skip preparation or cut answers short.
-- ---------------------------------------------------------------------------
create or replace function public.invite_record_progress(
  p_invitation uuid, p_session uuid, p_position integer, p_state public.session_question_state, p_method text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_s public.interview_sessions;
  v_q public.interview_session_questions;
  v_slack constant interval := interval '3 seconds';
  v_answer_from timestamptz;
begin
  select * into v_s from public.interview_sessions where id = p_session and invitation_id = p_invitation for update;
  if v_s.id is null then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if v_s.status in ('completed', 'abandoned') then return jsonb_build_object('ok', false, 'reason', 'closed'); end if;
  select * into v_q from public.interview_session_questions where session_id = p_session and position = p_position for update;
  if v_q.id is null then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if exists (select 1 from public.interview_session_questions where session_id = p_session and position < p_position and state not in ('completed', 'timed_out')) then
    return jsonb_build_object('ok', false, 'reason', 'previous_unfinished');
  end if;
  if public.session_state_rank(p_state) <= public.session_state_rank(v_q.state) then
    return jsonb_build_object('ok', true, 'applied', false);
  end if;

  v_answer_from := coalesce(v_q.answer_started_at, v_q.presented_at + make_interval(secs => v_q.prep_seconds));
  if p_state = 'answering' and (v_q.presented_at is null or now() < v_q.presented_at + make_interval(secs => v_q.prep_seconds) - v_slack) then
    return jsonb_build_object('ok', false, 'reason', 'too_early');
  end if;
  if p_state in ('awaiting_submit', 'timed_out') and (v_answer_from is null or now() < v_answer_from + make_interval(secs => v_q.answer_seconds) - v_slack) then
    return jsonb_build_object('ok', false, 'reason', 'too_early');
  end if;
  if p_state = 'awaiting_submit' and v_q.submission_mode <> 'manual' then
    return jsonb_build_object('ok', false, 'reason', 'not_manual');
  end if;
  if p_state = 'completed' then
    if p_method = 'early' then
      if coalesce((v_s.config->>'allowEarlySubmit')::boolean, false) is not true or v_answer_from is null or now() < v_answer_from - v_slack then
        return jsonb_build_object('ok', false, 'reason', 'early_not_allowed');
      end if;
    elsif p_method = 'manual' then
      if v_q.state <> 'awaiting_submit' then return jsonb_build_object('ok', false, 'reason', 'not_awaiting'); end if;
    else
      return jsonb_build_object('ok', false, 'reason', 'bad_method');
    end if;
  end if;

  update public.interview_session_questions set
    state = p_state,
    presented_at = coalesce(presented_at, now()),
    answer_started_at = case when public.session_state_rank(p_state) >= 2 then coalesce(answer_started_at, least(now(), coalesce(v_answer_from, now()))) else answer_started_at end,
    completed_at = case when p_state in ('completed', 'timed_out') then now() else completed_at end,
    completion_method = case when p_state in ('completed', 'timed_out') then coalesce(p_method, 'automatic') else completion_method end
  where id = v_q.id;

  update public.interview_sessions set
    status = 'in_progress',
    started_at = coalesce(started_at, now()),
    last_activity_at = now(),
    current_position = greatest(current_position, case when p_state in ('completed', 'timed_out') then p_position + 1 else p_position end)
  where id = p_session;

  insert into public.interview_events (session_id, event_type, position, payload)
  values (p_session, 'question_' || p_state::text, p_position, jsonb_build_object('method', p_method));
  return jsonb_build_object('ok', true, 'applied', true);
end $$;

create or replace function public.invite_complete_session(p_invitation uuid, p_session uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_s public.interview_sessions;
begin
  select * into v_s from public.interview_sessions where id = p_session and invitation_id = p_invitation for update;
  if v_s.id is null then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if v_s.status = 'completed' then return jsonb_build_object('ok', true, 'duration_seconds', v_s.duration_seconds); end if;
  if exists (select 1 from public.interview_session_questions where session_id = p_session and state not in ('completed', 'timed_out')) then
    return jsonb_build_object('ok', false, 'reason', 'unanswered');
  end if;
  update public.interview_sessions set
    status = 'completed', completed_at = now(), last_activity_at = now(), current_position = question_count,
    duration_seconds = greatest(0, extract(epoch from (now() - coalesce(started_at, created_at)))::integer)
  where id = p_session returning * into v_s;
  insert into public.interview_events (session_id, event_type) values (p_session, 'session_completed');
  return jsonb_build_object('ok', true, 'duration_seconds', v_s.duration_seconds);
end $$;

create or replace function public.invite_abandon_session(p_invitation uuid, p_session uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.interview_sessions set status = 'abandoned', last_activity_at = now()
  where id = p_session and invitation_id = p_invitation and status in ('ready', 'in_progress');
  if found then insert into public.interview_events (session_id, event_type) values (p_session, 'session_abandoned'); end if;
end $$;

revoke all on function public.new_invitation_token() from public, anon, authenticated;
revoke all on function public.hash_invitation_token(text) from public, anon, authenticated;
revoke all on function public.admin_create_invitation(jsonb) from public, anon;
revoke all on function public.admin_invitation_token(uuid) from public, anon;
revoke all on function public.admin_regenerate_invitation(uuid) from public, anon;
revoke all on function public.invite_record_progress(uuid, uuid, integer, public.session_question_state, text) from public, anon, authenticated;
revoke all on function public.invite_complete_session(uuid, uuid) from public, anon, authenticated;
revoke all on function public.invite_abandon_session(uuid, uuid) from public, anon, authenticated;
grant execute on function public.admin_create_invitation(jsonb) to authenticated;
grant execute on function public.admin_invitation_token(uuid) to authenticated;
grant execute on function public.admin_regenerate_invitation(uuid) to authenticated;
grant execute on function public.hash_invitation_token(text) to service_role;
grant execute on function public.invite_record_progress(uuid, uuid, integer, public.session_question_state, text) to service_role;
grant execute on function public.invite_complete_session(uuid, uuid) to service_role;
grant execute on function public.invite_abandon_session(uuid, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Live progress for the admin dashboard (security_invoker: RLS applies, so
-- only admins see rows).
-- ---------------------------------------------------------------------------
create or replace view public.admin_invitation_progress with (security_invoker = true) as
select
  i.id, i.student_name, i.student_ref, i.created_at, i.expires_at, i.revoked_at,
  i.max_attempts, i.attempts_used, i.last_opened_at, i.resume_context_status,
  i.university_id, u.name as university_name, i.course_id, c.name as course_name,
  s.id as session_id, s.status as session_status, s.created_at as session_created_at, s.started_at, s.completed_at,
  s.last_activity_at, coalesce(s.question_count, 0) as total_questions,
  coalesce(q.done, 0) as completed_questions,
  q.current_position, q.current_state,
  case
    when s.status = 'completed' then 'completed'
    when s.status = 'abandoned' then 'interrupted'
    when s.status in ('ready', 'in_progress')
      and s.last_activity_at < now() - greatest(interval '20 minutes', make_interval(secs => coalesce(q.longest_stage, 0)) + interval '5 minutes')
      then 'interrupted'
    when s.status in ('ready', 'in_progress') then 'in_progress'
    when i.revoked_at is not null or i.expires_at < now() then 'expired'
    else 'not_started'
  end as status
from public.interview_invitations i
join public.universities u on u.id = i.university_id
join public.courses c on c.id = i.course_id
left join lateral (
  select * from public.interview_sessions s where s.invitation_id = i.id order by s.created_at desc limit 1
) s on true
left join lateral (
  select
    count(*) filter (where qq.state in ('completed', 'timed_out')) as done,
    max(qq.prep_seconds + qq.answer_seconds) as longest_stage,
    (select qx.position from public.interview_session_questions qx where qx.session_id = s.id and qx.state not in ('completed', 'timed_out') order by qx.position limit 1) as current_position,
    (select qx.state from public.interview_session_questions qx where qx.session_id = s.id and qx.state not in ('completed', 'timed_out') order by qx.position limit 1) as current_state
  from public.interview_session_questions qq where qq.session_id = s.id
) q on true;

grant select on public.admin_invitation_progress to authenticated;

-- Realtime change feed for the admin dashboard (RLS still applies).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.interview_invitations, public.interview_sessions, public.interview_session_questions;
  end if;
end $$;
