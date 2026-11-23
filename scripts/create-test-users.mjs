// Creates (or resets) a confirmed test ADMIN account for local acceptance testing.
// Students have no accounts. Credentials go to .env.test.local (gitignored).
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const env = Object.fromEntries(readFileSync(".env.local", "utf8").split("\n").filter((l) => l && !l.startsWith("#") && l.includes("="))
  .map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const email = "admin@interview-prep.test";
const password = randomBytes(12).toString("base64url");
const { data: list } = await db.auth.admin.listUsers();
const existing = list.users.find((u) => u.email === email);
const res = existing ? await db.auth.admin.updateUserById(existing.id, { password }) : await db.auth.admin.createUser({ email, password, email_confirm: true });
if (res.error) throw res.error;
const { error } = await db.from("users").update({ role: "admin" }).eq("id", res.data.user.id);
if (error) throw error;
writeFileSync(".env.test.local", `TEST_ADMIN_EMAIL=${email}\nTEST_ADMIN_PASSWORD=${password}\n`, { mode: 0o600 });
console.log(`${email}: ok`);
