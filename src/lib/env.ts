import "server-only";

export function publicSupabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new MissingConfigError("NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY");
  return { url, key };
}

export function serviceRoleKey() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new MissingConfigError("SUPABASE_SERVICE_ROLE_KEY");
  return key;
}

export class MissingConfigError extends Error {
  constructor(what: string) {
    super(`Server configuration missing: ${what}. See .env.example.`);
    this.name = "MissingConfigError";
  }
}

export function isSupabaseConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}
