// Live checks for the link-based student flow (no student accounts):
// token validation, isolation between invitations, server-side timing, revoke/expiry,
// attempt limits, and that anonymous visitors cannot read any table.
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
const env = Object.fromEntries([".env.local", ".env.test.local"].flatMap((f) => readFileSync(f, "utf8").split("\n"))
  .filter((l) => l && !l.startsWith("#") && l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const URL = env.NEXT_PUBLIC_SUPABASE_URL, ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const anon = createClient(URL, ANON, { auth: { persistSession: false } });
const admin = createClient(URL, ANON, { auth: { persistSession: false } });
await admin.auth.signInWithPassword({ email: env.TEST_ADMIN_EMAIL, password: env.TEST_ADMIN_PASSWORD });
const invite = async (body) => {
  const { data, error } = await anon.functions.invoke("invite", { body });
  if (error) return { status: error.context?.status, ...(await error.context?.json?.().catch(() => ({}))) };
  return data;
};
const { data: course } = await admin.from("courses").select("id, university_id").limit(1).single();
const mk = async (extra = {}) => {
  const { data, error } = await admin.rpc("admin_create_invitation", { p: { student_name: "Check Student", student_ref: `CHK-${Date.now()}`, university_id: course.university_id, course_id: course.id, max_attempts: 1, prep_seconds: 20, answer_seconds: 30, question_count: 2, ai_question_count: 0, ...extra } });
  if (error) throw error;
  return data[0];
};
const r = {};
const a = await mk(), b = await mk();
r["bad token"] = (await invite({ action: "open", token: "x".repeat(43) })).code;
const openA = await invite({ action: "open", token: a.token });
r["open A"] = `${openA.invitation?.universityName} / ${openA.invitation?.courseName}`;
const startA = await invite({ action: "start", token: a.token });
const sid = startA.session?.id;
r["start A questions"] = startA.session?.questions?.length;
r["start A again returns same session"] = (await invite({ action: "start", token: a.token })).session?.id === sid;
r["B drives A's session"] = JSON.stringify(await invite({ action: "progress", token: b.token, sessionId: sid, position: 0, state: "preparing" }));
r["A preparing"] = JSON.stringify(await invite({ action: "progress", token: a.token, sessionId: sid, position: 0, state: "preparing" }));
r["A skip prep"] = JSON.stringify(await invite({ action: "progress", token: a.token, sessionId: sid, position: 0, state: "answering" }));
r["A early submit during prep"] = JSON.stringify(await invite({ action: "progress", token: a.token, sessionId: sid, position: 0, state: "completed", method: "early" }));
r["anon reads invitations"] = JSON.stringify(await anon.from("interview_invitations").select("id"));
r["anon reads sessions"] = JSON.stringify(await anon.from("interview_sessions").select("id"));
r["anon calls admin_create_invitation"] = (await anon.rpc("admin_create_invitation", { p: {} })).error?.code ?? "ALLOWED (BAD)";
await admin.from("interview_invitations").update({ revoked_at: new Date().toISOString() }).eq("id", b.id);
r["revoked link"] = (await invite({ action: "open", token: b.token })).code;
const newB = (await admin.rpc("admin_regenerate_invitation", { p_id: b.id })).data;
r["old link after regenerate"] = (await invite({ action: "open", token: b.token })).code;
r["new link after regenerate"] = (await invite({ action: "open", token: newB })).invitation ? "ok" : "FAILED";
await invite({ action: "abandon", token: a.token, sessionId: sid });
r["attempt limit after abandon"] = (await invite({ action: "start", token: a.token })).code;
await admin.from("interview_invitations").update({ max_attempts: 2 }).eq("id", a.id);
r["allow retry"] = (await invite({ action: "start", token: a.token })).session ? "new session" : "FAILED";
await admin.from("interview_invitations").update({ expires_at: new Date(Date.now() - 60000).toISOString() }).eq("id", a.id);
r["expired link"] = (await invite({ action: "open", token: a.token })).code;
const { data: view } = await admin.from("admin_invitation_progress").select("student_ref, status, total_questions, completed_questions").in("id", [a.id, b.id]);
r["admin progress view"] = JSON.stringify(view);
await admin.from("interview_invitations").delete().in("id", [a.id, b.id]);
console.log(JSON.stringify(r, null, 1));
