-- Behavioural checks for RLS and session functions. Any failure raises an exception.
\set ON_ERROR_STOP on
begin;
insert into auth.users values ('00000000-0000-0000-0000-00000000000a', 'alice@test.local'),
                              ('00000000-0000-0000-0000-00000000000b', 'bob@test.local'),
                              ('00000000-0000-0000-0000-0000000000ad', 'admin@test.local');
update public.users set role = 'admin' where id = '00000000-0000-0000-0000-0000000000ad';
insert into public.universities (id, name) values ('10000000-0000-0000-0000-000000000001', 'Test University A'),
                                                  ('10000000-0000-0000-0000-000000000002', 'Test University B');
insert into public.courses (id, university_id, name) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'MSc Business Analytics'),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', 'MSc Project Management');
grant execute on all functions in schema public to authenticated;
commit;

-- Alice: profile, document, application
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
insert into public.student_profiles (user_id, full_name, student_id, email) values (auth.uid(), 'Alice', 'S1', 'alice@test.local');
insert into public.student_documents (user_id, kind, storage_path, file_name, mime_type, size_bytes)
  values (auth.uid(), 'resume', auth.uid() || '/cv.pdf', 'cv.pdf', 'application/pdf', 100);
insert into storage.objects (bucket_id, name) values ('student-documents', auth.uid() || '/cv.pdf');
insert into public.student_applications (id, user_id, university_id, course_id)
  values ('30000000-0000-0000-0000-000000000001', auth.uid(), '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001');

do $$ begin
  -- mixed context is impossible: course B does not belong to university A
  begin
    insert into public.student_applications (user_id, university_id, course_id)
      values (auth.uid(), '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002');
    raise exception 'FAIL: mismatched university/course accepted';
  exception when foreign_key_violation then null; end;
  -- students cannot read the question bank or promote themselves
  if (select count(*) from public.question_bank) <> 0 then raise exception 'FAIL: student sees question bank'; end if;
  update public.users set role = 'admin' where id = auth.uid();
  if (select role from public.users where id = auth.uid()) <> 'student' then raise exception 'FAIL: self-promotion'; end if;
  -- documents outside own folder are rejected
  begin
    insert into storage.objects (bucket_id, name) values ('student-documents', '00000000-0000-0000-0000-00000000000b/x.pdf');
    raise exception 'FAIL: wrote into another student folder';
  exception when insufficient_privilege then null; end;
end $$;

-- Bob cannot see Alice's data
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
do $$ begin
  if (select count(*) from public.student_documents) <> 0 then raise exception 'FAIL: bob sees alice documents'; end if;
  if (select count(*) from storage.objects) <> 0 then raise exception 'FAIL: bob sees alice files'; end if;
  if (select count(*) from public.student_profiles) <> 0 then raise exception 'FAIL: bob sees alice profile'; end if;
  if (select count(*) from public.student_applications) <> 0 then raise exception 'FAIL: bob sees alice applications'; end if;
  delete from public.student_documents; -- silently affects nothing
end $$;

-- Server creates a session for Alice (service role bypasses RLS)
reset role;
insert into public.interview_sessions (id, user_id, application_id, university_name, course_name, generation_mode, config, question_count)
  values ('40000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-000000000001',
          'Test University A', 'MSc Business Analytics', 'bank_only', '{}', 2);
insert into public.interview_session_questions (session_id, position, question_text, origin, prep_seconds, answer_seconds, submission_mode)
  values ('40000000-0000-0000-0000-000000000001', 0, 'Q1?', 'manual', 20, 60, 'automatic'),
         ('40000000-0000-0000-0000-000000000001', 1, 'Q2?', 'manual', 20, 60, 'manual');

-- Bob cannot drive Alice's session
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
do $$ begin
  begin
    perform public.record_session_progress('40000000-0000-0000-0000-000000000001', 0, 'preparing');
    raise exception 'FAIL: bob progressed alice session';
  exception when no_data_found then null; end;
end $$;

-- Alice: transitions are ordered, idempotent and cannot skip ahead
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
do $$ declare r jsonb; begin
  begin
    perform public.record_session_progress('40000000-0000-0000-0000-000000000001', 1, 'preparing');
    raise exception 'FAIL: skipped question 0';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
  r := public.record_session_progress('40000000-0000-0000-0000-000000000001', 0, 'preparing');
  r := public.record_session_progress('40000000-0000-0000-0000-000000000001', 0, 'answering');
  r := public.record_session_progress('40000000-0000-0000-0000-000000000001', 0, 'completed', 'automatic');
  r := public.record_session_progress('40000000-0000-0000-0000-000000000001', 0, 'completed', 'automatic');
  if (r->>'applied')::boolean then raise exception 'FAIL: duplicate submission applied twice'; end if;
  r := public.record_session_progress('40000000-0000-0000-0000-000000000001', 0, 'answering');
  if (r->>'applied')::boolean then raise exception 'FAIL: moved backwards'; end if;
  begin
    perform public.complete_session('40000000-0000-0000-0000-000000000001');
    raise exception 'FAIL: completed with unanswered question';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
  perform public.record_session_progress('40000000-0000-0000-0000-000000000001', 1, 'preparing');
  perform public.record_session_progress('40000000-0000-0000-0000-000000000001', 1, 'answering');
  perform public.record_session_progress('40000000-0000-0000-0000-000000000001', 1, 'awaiting_submit');
  perform public.record_session_progress('40000000-0000-0000-0000-000000000001', 1, 'completed', 'manual');
  perform public.complete_session('40000000-0000-0000-0000-000000000001');
  if (select status from public.interview_sessions where id = '40000000-0000-0000-0000-000000000001') <> 'completed' then
    raise exception 'FAIL: session not completed';
  end if;
  if (select count(*) from public.interview_events where session_id = '40000000-0000-0000-0000-000000000001') <> 8 then
    raise exception 'FAIL: expected 8 events, got %', (select count(*) from public.interview_events);
  end if;
end $$;

-- Admin sees the question bank; an active question must be approved
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000ad', false);
do $$ begin
  if (select count(*) from public.question_bank) <> 49 then raise exception 'FAIL: admin should see 49 imported questions'; end if;
  if (select count(*) from public.question_bank where is_active) <> 0 then raise exception 'FAIL: imports must start inactive'; end if;
  begin
    update public.question_bank set is_active = true where review_status = 'pending_review';
    raise exception 'FAIL: activated an unreviewed question';
  exception when check_violation then null; end;
  begin
    update public.question_bank set review_status = 'approved', is_active = true where mentions_university is not null;
    raise exception 'FAIL: activated a university-specific question without applicability';
  exception when check_violation then null; end;
  if (select count(*) from public.question_bank where is_sensitive) < 5 then raise exception 'FAIL: sensitive flags missing'; end if;
  if (select count(*) from public.student_documents) <> 1 then raise exception 'FAIL: admin metadata view'; end if;
  if (select count(*) from storage.objects) <> 0 then raise exception 'FAIL: admin must not read student files'; end if;
end $$;
reset role;
select 'ALL RLS CHECKS PASSED' as result;
