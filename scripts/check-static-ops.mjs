// Verifies operations the static site performs without a server:
// direct storage upload into the owner's folder, self account deletion, admin deletion.
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
const env = Object.fromEntries([".env.local", ".env.test.local"].flatMap((f) => readFileSync(f, "utf8").split("\n"))
  .filter((l) => l && !l.startsWith("#") && l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const URL = env.NEXT_PUBLIC_SUPABASE_URL, ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const service = createClient(URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const mk = async () => {
  const email = `temp-${randomBytes(4).toString("hex")}@interview-prep.test`, password = randomBytes(12).toString("base64url");
  const { data } = await service.auth.admin.createUser({ email, password, email_confirm: true });
  const c = createClient(URL, ANON, { auth: { persistSession: false } });
  await c.auth.signInWithPassword({ email, password });
  return { id: data.user.id, c };
};
const r = {};
const a = await mk();
const pdf = new Blob(["%PDF-1.4 test"], { type: "application/pdf" });
r["own-folder upload"] = (await a.c.storage.from("student-documents").upload(`${a.id}/resume-x.pdf`, pdf, { contentType: "application/pdf" })).error ? "FAILED" : "ok";
r["other-folder upload"] = (await a.c.storage.from("student-documents").upload(`00000000-0000-0000-0000-000000000000/x.pdf`, pdf, { contentType: "application/pdf" })).error ? "denied" : "ALLOWED (BAD)";
r["disallowed type upload"] = (await a.c.storage.from("student-documents").upload(`${a.id}/x.html`, new Blob(["<script>"], { type: "text/html" }), { contentType: "text/html" })).error ? "denied" : "ALLOWED (BAD)";
await a.c.storage.from("student-documents").remove([`${a.id}/resume-x.pdf`]);
const b = await mk();
r["student calls admin_delete_user"] = (await a.c.rpc("admin_delete_user", { p_user: b.id })).error ? "denied" : "ALLOWED (BAD)";
r["self delete_my_account"] = (await a.c.rpc("delete_my_account")).error?.message ?? "ok";
r["self account gone"] = (await service.auth.admin.getUserById(a.id)).data.user ? "STILL THERE (BAD)" : "gone";
const adm = createClient(URL, ANON, { auth: { persistSession: false } });
await adm.auth.signInWithPassword({ email: env.TEST_ADMIN_EMAIL, password: env.TEST_ADMIN_PASSWORD });
r["admin_delete_user"] = (await adm.rpc("admin_delete_user", { p_user: b.id })).error?.message ?? "ok";
r["deleted user gone"] = (await service.auth.admin.getUserById(b.id)).data.user ? "STILL THERE (BAD)" : "gone";
console.log(JSON.stringify(r, null, 1));
