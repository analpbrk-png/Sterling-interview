-- Behavioural checks for the invitation model. Any failure raises an exception.
\set ON_ERROR_STOP on
begin;
insert into auth.users values ('00000000-0000-0000-0000-0000000000ad', 'admin@test.local'),
                              ('00000000-0000-0000-0000-00000000000b', 'random@test.local');
update public.users set role = 'admin' where id = '00000000-0000-0000-0000-0000000000ad';
insert into public.universities (id, name) values ('10000000-0000-0000-0000-000000000001', 'Test University A'),
                                                  ('10000000-0000-0000-0000-000000000002', 'Test University B');
insert into public.courses (id, university_id, name) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'MSc Business Analytics'),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', 'MSc Project Management');
commit;

-- A signed-in non-admin (e.g. someone who registered on their own) cannot create or see anything.
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
do $$ begin
  begin
    perform public.admin_create_invitation('{"student_name":"X","student_ref":"1","university_id":"10000000-0000-0000-0000-000000000001","course_id":"20000000-0000-0000-0000-000000000001"}');
    raise exception 'FAIL: non-admin created invitation';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
  begin
    perform public.invite_record_progress(gen_random_uuid(), gen_random_uuid(), 0, 'preparing');
    raise exception 'FAIL: authenticated user may call service-only function';
  exception when insufficient_privilege then null; end;
  if (select count(*) from public.question_bank) <> 0 then raise exception 'FAIL: non-admin sees question bank'; end if;
end $$;
reset role;
-- Signed-out visitors cannot read anything.
set role anon;
do $$ begin
  begin perform 1 from public.interview_invitations; raise exception 'FAIL: anon reads invitations';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- Admin creates an invitation: token returned once, only its hash stored.
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000ad', false);
create temp table t_inv as select * from public.admin_create_invitation('{"student_name":"Student A","student_ref":"S1","university_id":"10000000-0000-0000-0000-000000000001","course_id":"20000000-0000-0000-0000-000000000001","expires_in_days":"7","max_attempts":"2"}');
do $$ declare v record; t text; begin
  select * into v from t_inv;
  if length(v.token) < 40 then raise exception 'FAIL: short token'; end if;
  if exists (select 1 from public.interview_invitations where token_hash = v.token) then raise exception 'FAIL: raw token stored'; end if;
  if (select token_hash from public.interview_invitations where id = v.id) <> encode(digest(v.token, 'sha256'), 'hex') then raise exception 'FAIL: hash mismatch'; end if;
  if public.admin_invitation_token(v.id) <> v.token then raise exception 'FAIL: copy-link token differs'; end if;
  t := public.admin_regenerate_invitation(v.id);
  if t = v.token or (select token_hash from public.interview_invitations where id = v.id) <> encode(digest(t, 'sha256'), 'hex') then raise exception 'FAIL: regenerate'; end if;
  begin
    perform public.admin_create_invitation('{"student_name":"Mixed","student_ref":"2","university_id":"10000000-0000-0000-0000-000000000001","course_id":"20000000-0000-0000-0000-000000000002"}');
    raise exception 'FAIL: course from another university accepted';
  exception when foreign_key_violation then null; end;
end $$;
reset role;

-- The Edge Function (service role) creates a session and records progress.
do $$ declare inv uuid; other uuid; sid uuid := gen_random_uuid(); r jsonb; begin
  select id into inv from public.interview_invitations limit 1;
  insert into public.interview_invitations (token_hash, student_name, student_ref, university_id, course_id, expires_at)
    values (repeat('a', 64), 'Student B', 'S2', '10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002', now() + interval '1 day') returning id into other;
  insert into public.interview_sessions (id, invitation_id, university_name, course_name, generation_mode, config, question_count)
    values (sid, inv, 'Test University A', 'MSc Business Analytics', 'bank_only', '{"allowEarlySubmit": true}', 2);
  insert into public.interview_session_questions (session_id, position, question_text, origin, prep_seconds, answer_seconds, submission_mode)
    values (sid, 0, 'Q1?', 'manual', 20, 60, 'automatic'), (sid, 1, 'Q2?', 'manual', 20, 60, 'manual');

  r := public.invite_record_progress(other, sid, 0, 'preparing');
  if (r->>'ok')::boolean then raise exception 'FAIL: another invitation drove this session'; end if;
  r := public.invite_record_progress(inv, sid, 1, 'preparing');
  if (r->>'ok')::boolean then raise exception 'FAIL: skipped question 0'; end if;
  r := public.invite_record_progress(inv, sid, 0, 'preparing');
  r := public.invite_record_progress(inv, sid, 0, 'answering');
  if (r->>'ok')::boolean then raise exception 'FAIL: preparation skipped (server clock not enforced)'; end if;
  update public.interview_session_questions set presented_at = now() - interval '21 seconds' where session_id = sid and position = 0;
  r := public.invite_record_progress(inv, sid, 0, 'answering');
  if not (r->>'applied')::boolean then raise exception 'FAIL: answering after prep: %', r; end if;
  r := public.invite_record_progress(inv, sid, 0, 'timed_out', 'automatic');
  if (r->>'ok')::boolean then raise exception 'FAIL: answer cut short'; end if;
  r := public.invite_record_progress(inv, sid, 0, 'completed', 'early');
  if not (r->>'applied')::boolean then raise exception 'FAIL: early submit refused: %', r; end if;
  r := public.invite_record_progress(inv, sid, 0, 'completed', 'early');
  if (r->>'applied')::boolean then raise exception 'FAIL: duplicate submission applied'; end if;
  r := public.invite_complete_session(inv, sid);
  if (r->>'ok')::boolean then raise exception 'FAIL: completed with unanswered question'; end if;
  r := public.invite_record_progress(inv, sid, 1, 'preparing');
  update public.interview_session_questions set presented_at = now() - interval '90 seconds' where session_id = sid and position = 1;
  -- refresh after the answer time ran out: server accepts the time-out without an answering event
  r := public.invite_record_progress(inv, sid, 1, 'awaiting_submit');
  if not (r->>'applied')::boolean then raise exception 'FAIL: awaiting_submit after time: %', r; end if;
  r := public.invite_record_progress(inv, sid, 1, 'completed', 'manual');
  r := public.invite_complete_session(inv, sid);
  if not (r->>'ok')::boolean then raise exception 'FAIL: completion: %', r; end if;
  if (select status from public.interview_sessions where id = sid) <> 'completed' then raise exception 'FAIL: status'; end if;
end $$;

-- Admin progress view shows real counts; non-admins see nothing.
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000ad', false);
do $$ declare v record; begin
  select * into v from public.admin_invitation_progress where student_ref = 'S1';
  if v.status <> 'completed' or v.completed_questions <> 2 or v.total_questions <> 2 then raise exception 'FAIL: progress view %', row_to_json(v); end if;
  if (select status from public.admin_invitation_progress where student_ref = 'S2') <> 'not_started' then raise exception 'FAIL: not_started'; end if;
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
do $$ begin
  if (select count(*) from public.admin_invitation_progress) <> 0 then raise exception 'FAIL: non-admin sees progress'; end if;
  if (select count(*) from public.interview_sessions) <> 0 then raise exception 'FAIL: non-admin sees sessions'; end if;
end $$;
reset role;
update public.interview_invitations set expires_at = now() - interval '1 minute' where student_ref = 'S2';
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000ad', false);
do $$ begin
  if (select status from public.admin_invitation_progress where student_ref = 'S2') <> 'expired' then raise exception 'FAIL: expired status'; end if;
  if (select count(*) from public.question_bank) <> 49 then raise exception 'FAIL: admin should see 49 imported questions'; end if;
  begin
    update public.question_bank set is_active = true where review_status = 'pending_review';
    raise exception 'FAIL: activated an unreviewed question';
  exception when check_violation then null; end;
end $$;
reset role;
select 'ALL INVITATION CHECKS PASSED' as result;
