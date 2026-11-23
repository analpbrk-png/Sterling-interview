import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export interface AppUser {
  id: string;
  email: string;
  role: "student" | "admin";
}

/** Current user verified against Supabase Auth (not just the cookie). */
export const getCurrentUser = cache(async (): Promise<AppUser | null> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return null;
  const { data: row } = await supabase.from("users").select("id, email, role").eq("id", data.user.id).maybeSingle();
  return { id: data.user.id, email: data.user.email ?? row?.email ?? "", role: (row?.role as AppUser["role"]) ?? "student" };
});

export async function requireUser(next = "/dashboard"): Promise<AppUser> {
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(next)}`);
  return user;
}

export async function requireAdmin(): Promise<AppUser> {
  const user = await requireUser("/admin");
  if (user.role !== "admin") redirect("/dashboard?error=admin_only");
  return user;
}

/** For route handlers: returns a JSON-friendly error instead of redirecting. */
export async function userOrNull() {
  return getCurrentUser();
}
