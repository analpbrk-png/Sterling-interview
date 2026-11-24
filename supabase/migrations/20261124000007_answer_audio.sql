-- Consent-based audio recording of spoken answers, local transcription and
-- practice analysis. Existing data is untouched: sessions without recordings
-- simply have no rows here.
--
-- Access model
--   * Students have no database access. They reach these tables only through
--     the `invite` Edge Function, which checks the link token, the session,
--     the question and the recorded consent, and hands out a short-lived
--     signed upload URL for exactly one object path.
--   * Admins (public.is_admin()) read and manage everything; audio files are
--     played through short-lived signed URLs from the private bucket.

-- ---------------------------------------------------------------------------
-- Consent
-- ---------------------------------------------------------------------------
alter table public.interview_invitations
  add column if not exists audio_consent boolean,
  add column if not exists audio_consent_at timestamptz;

alter table public.interview_sessions
  add column if not exists audio_consent boolean not null default false;

-- ---------------------------------------------------------------------------
-- Recordings: one per session question (unique), so retries never duplicate.
-- ---------------------------------------------------------------------------
create table if not exists public.interview_answer_recordings (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.interview_sessions (id) on delete cascade,
  session_question_id uuid not null unique references public.interview_session_questions (id) on delete cascade,
  storage_path text not null unique,
  mime_type text not null check (mime_type in ('audio/webm', 'audio/ogg', 'audio/mp4', 'audio/aac', 'audio/mpeg', 'audio/wav')),
  answer_window_ms integer not null check (answer_window_ms > 0),
  recorded_duration_ms integer check (recorded_duration_ms >= 0),
  speech_duration_ms integer check (speech_duration_ms >= 0),
  silence_duration_ms integer check (silence_duration_ms >= 0),
  speech_is_estimate boolean not null default true,
  vad jsonb not null default '{}'::jsonb,           -- detector settings and noise floor, for transparency
  is_partial boolean not null default false,        -- e.g. resumed after a page refresh mid-answer
  file_size integer check (file_size >= 0 and file_size <= 26214400),
  upload_status text not null default 'pending' check (upload_status in ('pending', 'uploaded', 'failed')),
  uploaded_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists answer_recordings_session_idx on public.interview_answer_recordings (session_id);

-- ---------------------------------------------------------------------------
-- Transcripts: produced in the admin's browser by a local Whisper model.
-- machine_text keeps the model output; transcript_text is what admins see
-- (equal to machine_text until an admin corrects it).
-- ---------------------------------------------------------------------------
create table if not exists public.interview_transcripts (
  id uuid primary key default gen_random_uuid(),
  recording_id uuid not null unique references public.interview_answer_recordings (id) on delete cascade,
  transcript_text text not null default '' check (char_length(transcript_text) <= 20000),
  machine_text text check (char_length(machine_text) <= 20000),
  transcription_status text not null check (transcription_status in ('completed', 'no_speech', 'failed')),
  word_count integer check (word_count >= 0),
  model_used text,
  error text,
  reviewed_at timestamptz,
  reviewed_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Practice analysis of one answer (educational feedback, not an evaluation).
-- Scores are null when a dimension could not be assessed.
-- ---------------------------------------------------------------------------
create table if not exists public.interview_answer_analysis (
  id uuid primary key default gen_random_uuid(),
  recording_id uuid not null unique references public.interview_answer_recordings (id) on delete cascade,
  session_question_id uuid not null references public.interview_session_questions (id) on delete cascade,
  question_id uuid references public.question_bank (id) on delete set null,
  rubric_version text not null,
  relevance_score smallint check (relevance_score between 0 and 100),
  content_score smallint check (content_score between 0 and 100),
  clarity_score smallint check (clarity_score between 0 and 100),
  completeness_score smallint check (completeness_score between 0 and 100),
  delivery_score smallint check (delivery_score between 0 and 100),
  overall_practice_score smallint check (overall_practice_score between 0 and 100),
  reasons jsonb not null default '{}'::jsonb,
  strengths text[] not null default '{}',
  weaknesses text[] not null default '{}',
  suggestions text[] not null default '{}',
  answer_outline text[] not null default '{}',
  transcript_snapshot text,                         -- the transcript that was analysed
  model_used text,
  analysis_status text not null check (analysis_status in ('completed', 'insufficient_evidence', 'failed')),
  created_at timestamptz not null default now()
);

alter table public.interview_answer_recordings enable row level security;
alter table public.interview_transcripts enable row level security;
alter table public.interview_answer_analysis enable row level security;
create policy answer_recordings_admin on public.interview_answer_recordings for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy transcripts_admin on public.interview_transcripts for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy answer_analysis_admin on public.interview_answer_analysis for all to authenticated using (public.is_admin()) with check (public.is_admin());
grant select, insert, update, delete on public.interview_answer_recordings, public.interview_transcripts, public.interview_answer_analysis to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Private audio bucket. Uploads happen only via signed upload URLs issued by
-- the invite function; admins may read (signed URLs) and delete.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('interview-audio', 'interview-audio', false, 26214400,
  array['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/aac', 'audio/mpeg', 'audio/wav'])
on conflict (id) do update set public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "interview audio: admin read" on storage.objects;
drop policy if exists "interview audio: admin delete" on storage.objects;
create policy "interview audio: admin read" on storage.objects for select to authenticated
  using (bucket_id = 'interview-audio' and public.is_admin());
create policy "interview audio: admin delete" on storage.objects for delete to authenticated
  using (bucket_id = 'interview-audio' and public.is_admin());

insert into public.admin_settings (key, value) values ('audio_retention_days', '365'::jsonb)
on conflict (key) do nothing;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.interview_answer_recordings;
  end if;
end $$;
