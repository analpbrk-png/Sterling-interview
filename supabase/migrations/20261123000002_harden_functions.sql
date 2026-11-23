-- Security advisor fixes.
-- Trigger-only function: never callable through the API.
revoke execute on function public.handle_new_auth_user() from public, anon, authenticated;
-- is_admin() is needed by RLS policies for signed-in users only.
revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;
-- Pin search_path on helper functions.
alter function public.touch_updated_at() set search_path = public;
alter function public.session_state_rank(public.session_question_state) set search_path = public;
