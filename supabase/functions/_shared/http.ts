import { createClient, type SupabaseClient } from "./deps.ts";

/** Origins allowed to call the functions from a browser. */
const ALLOWED = (Deno.env.get("ALLOWED_ORIGINS") ?? "https://analpbrk-png.github.io,http://localhost:3210")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

export function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") ?? "";
  return {
    "Access-Control-Allow-Origin": ALLOWED.includes(origin) ? origin : ALLOWED[0],
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}

export function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

/** Service-role client. Only used after the caller has been authenticated below. */
export function adminClient(): SupabaseClient {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Verifies the caller's Supabase JWT and returns their id and role. */
export async function requireCaller(req: Request, db: SupabaseClient) {
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) return null;
  const { data: row } = await db.from("users").select("role").eq("id", data.user.id).maybeSingle();
  return { id: data.user.id, role: (row?.role ?? "student") as "student" | "admin" };
}

export function handle(fn: (req: Request) => Promise<Response>) {
  return async (req: Request) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
    if (req.method !== "POST") return json(req, { error: "Method not allowed" }, 405);
    try {
      return await fn(req);
    } catch (err) {
      console.error(err instanceof Error ? err.message : err);
      return json(req, { error: "Something went wrong. Please try again." }, 500);
    }
  };
}
