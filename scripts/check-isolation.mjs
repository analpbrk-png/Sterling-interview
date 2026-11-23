// Signs in as student2 with the public anon key and tries to reach student1's data.
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
const env = Object.fromEntries(
  [".env.local", ".env.test.local"].flatMap((f) => readFileSync(f, "utf8").split("\n"))
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }),
);
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { data: doc } = await admin.from("student_documents").select("id, storage_path").limit(1).single();
const { data: sess } = await admin.from("interview_sessions").select("id").limit(1).single();

const s2 = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
await s2.auth.signInWithPassword({ email: env.TEST_STUDENT2_EMAIL, password: env.TEST_STUDENT2_PASSWORD });
const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });

const results = {};
for (const t of ["student_profiles", "student_documents", "student_applications", "interview_sessions", "interview_session_questions", "interview_events", "question_bank", "question_sources"]) {
  const { data, error } = await s2.from(t).select("*");
  results[`student2 reads ${t}`] = error ? `error: ${error.code}` : `${data.length} rows`;
}
const signed = await s2.storage.from("student-documents").createSignedUrl(doc.storage_path, 60);
results["student2 signed URL for student1 CV"] = signed.error ? `denied (${signed.error.message})` : "GOT URL (BAD)";
const dl = await s2.storage.from("student-documents").download(doc.storage_path);
results["student2 download student1 CV"] = dl.error ? "denied" : "DOWNLOADED (BAD)";
const up = await s2.storage.from("student-documents").upload(`${doc.storage_path.split("/")[0]}/x.pdf`, new Blob(["%PDF-"]), { contentType: "application/pdf" });
results["student2 write into student1 folder"] = up.error ? "denied" : "WROTE (BAD)";
const rpc = await s2.rpc("record_session_progress", { p_session: sess.id, p_position: 0, p_state: "preparing" });
results["student2 drives student1 session"] = rpc.error ? `denied (${rpc.error.message})` : "ALLOWED (BAD)";
const promote = await s2.from("users").update({ role: "admin" }).neq("id", "00000000-0000-0000-0000-000000000000").select();
results["student2 self-promote to admin"] = promote.data?.length ? "PROMOTED (BAD)" : "no rows changed";
const pub = await anon.storage.from("student-documents").getPublicUrl(doc.storage_path);
const pubRes = await fetch(pub.data.publicUrl);
results["public URL fetch of CV"] = `HTTP ${pubRes.status}`;
const anonQ = await anon.from("question_bank").select("id");
results["signed-out reads question_bank"] = anonQ.error ? `error: ${anonQ.error.code}` : `${anonQ.data.length} rows`;
console.log(JSON.stringify(results, null, 1));
