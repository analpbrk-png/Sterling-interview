"use client";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

/** Calls a Supabase Edge Function and returns its JSON, or a readable error. */
export async function callFunction<T>(name: string, body: Record<string, unknown>): Promise<{ data: T | null; error: string | null; code?: string }> {
  try {
    const { data, error } = await createClient().functions.invoke(name, { body });
    if (error) {
      if (error instanceof FunctionsHttpError) {
        const payload = await error.context.json().catch(() => ({}));
        return { data: null, error: payload.error ?? "Request failed.", code: payload.code };
      }
      return { data: null, error: "Could not reach the server. Check your connection and try again.", code: "network" };
    }
    return { data: data as T, error: null };
  } catch {
    return { data: null, error: "Could not reach the server. Check your connection and try again.", code: "network" };
  }
}
