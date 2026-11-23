"use client";
import { createClient as create, type SupabaseClient } from "@supabase/supabase-js";

/** True when the public Supabase settings were provided at build time. */
export const isSupabaseConfigured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

let client: SupabaseClient | null = null;

/**
 * Browser Supabase client. The anon key is public by design; every table is
 * protected by row level security and storage policies.
 */
export function createClient(): SupabaseClient {
  if (!isSupabaseConfigured) throw new Error("Supabase is not configured for this build.");
  client ??= create(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { flowType: "pkce", persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  });
  return client;
}

export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "";

/** Absolute URL inside this site (for auth email redirects). */
export function siteUrl(path: string) {
  return `${window.location.origin}${BASE_PATH}${path}`;
}
