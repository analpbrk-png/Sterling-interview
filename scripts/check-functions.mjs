// Calls the deployed Edge Functions as test users to confirm auth and ownership checks.
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
const env = Object.fromEntries([".env.local", ".env.test.local"].flatMap((f) => readFileSync(f, "utf8").split("\n"))
  .filter((l) => l && !l.startsWith("#") && l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const login = async (who) => {
  const c = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  if (who) await c.auth.signInWithPassword({ email: env[`TEST_${who}_EMAIL`], password: env[`TEST_${who}_PASSWORD`] });
  return c;
};
const call = async (c, fn, body) => {
  const { data, error } = await c.functions.invoke(fn, { body });
  if (error) return `ERR ${error.context?.status ?? ""} ${JSON.stringify(await error.context?.json?.().catch(() => null))}`;
  return JSON.stringify(data);
};
const s1 = await login("STUDENT1"), s2 = await login("STUDENT2"), ad = await login("ADMIN"), anon = await login(null);
const { data: app } = await s1.from("student_applications").select("id").order("created_at").limit(1).single();
console.log("student1 create-session own app:", await call(s1, "create-session", { applicationId: app.id }));
console.log("student2 create-session student1 app:", await call(s2, "create-session", { applicationId: app.id }));
console.log("signed-out create-session:", await call(anon, "create-session", { applicationId: app.id }));
console.log("student1 generate-questions:", await call(s1, "generate-questions", { action: "status" }));
console.log("admin ai status:", await call(ad, "generate-questions", { action: "status" }));
console.log("student1 extract-resume:", await call(s1, "extract-resume", { text: "EDUCATION\nBCom Accounting 2024\nSKILLS\nExcel, SQL and Power BI for reporting" }));
