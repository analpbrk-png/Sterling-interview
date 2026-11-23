// Creates confirmed test accounts for local acceptance testing and writes them to .env.test.local (gitignored).
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8").split("\n").filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }),
);
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const out = [];
for (const name of ["admin", "student1", "student2"]) {
  const email = `${name}@interview-prep.test`;
  const password = randomBytes(12).toString("base64url");
  const { data: list } = await db.auth.admin.listUsers();
  const existing = list.users.find((u) => u.email === email);
  const res = existing
    ? await db.auth.admin.updateUserById(existing.id, { password })
    : await db.auth.admin.createUser({ email, password, email_confirm: true });
  if (res.error) throw res.error;
  if (name === "admin") await db.from("users").update({ role: "admin" }).eq("id", res.data.user.id);
  out.push(`TEST_${name.toUpperCase()}_EMAIL=${email}`, `TEST_${name.toUpperCase()}_PASSWORD=${password}`);
  console.log(`${email}: ok`);
}
writeFileSync(".env.test.local", out.join("\n") + "\n", { mode: 0o600 });
