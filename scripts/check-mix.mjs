// Live check: interviews of 10, 15 and 20 questions are built with the configured
// mix (PDF bank / personalised / course), without repeats, from the full bank.
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
const env = Object.fromEntries([".env.local", ".env.test.local"].flatMap((f) => readFileSync(f, "utf8").split("\n"))
  .filter((l) => l && !l.startsWith("#") && l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
await admin.auth.signInWithPassword({ email: env.TEST_ADMIN_EMAIL, password: env.TEST_ADMIN_PASSWORD });
const { data: course } = await admin.from("courses").select("id, university_id, name").eq("name", "MSc Business Analytics").single();
const out = {};
for (const total of [10, 15, 20]) {
  const personal = Math.round((total * 4) / 15), courseN = Math.round((total * 2) / 15);
  const { data } = await admin.rpc("admin_create_invitation", { p: { student_name: `Mix ${total}`, student_ref: `MIX-${total}-${Date.now()}`, university_id: course.university_id, course_id: course.id, previous_qualification: "BCom (Accounting)", question_count: total, bank_question_count: total - personal - courseN, personal_question_count: personal, course_question_count: courseN } });
  const { id, token } = data[0];
  const { data: started } = await anon.functions.invoke("invite", { body: { action: "start", token } });
  const qs = started?.session?.questions ?? [];
  const { data: rows } = await admin.from("interview_session_questions").select("origin, category_id, question_id, question_text").eq("session_id", started.session.id);
  const texts = rows.map((r) => r.question_text);
  out[`${total} questions`] = {
    delivered: qs.length,
    by_origin: rows.reduce((a, r) => ({ ...a, [r.origin]: (a[r.origin] ?? 0) + 1 }), {}),
    course_category: rows.filter((r) => ["why_course", "course_modules", "why_university", "university_research"].includes(r.category_id)).length,
    unique_texts: new Set(texts).size,
    notice: started.session.generation_notice,
    sample_template: rows.find((r) => r.origin === "template")?.question_text,
  };
  await admin.from("interview_invitations").delete().eq("id", id);
}
console.log(JSON.stringify(out, null, 1));
