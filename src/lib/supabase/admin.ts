import "server-only";
import { createClient } from "@supabase/supabase-js";
import { publicSupabaseEnv, serviceRoleKey } from "@/lib/env";

/**
 * Service-role client. Bypasses RLS: use only in server code AFTER the caller
 * has been authorised (requireUser / requireAdmin), and scope every query.
 */
export function createAdminClient() {
  const { url } = publicSupabaseEnv();
  return createClient(url, serviceRoleKey(), { auth: { persistSession: false, autoRefreshToken: false } });
}
