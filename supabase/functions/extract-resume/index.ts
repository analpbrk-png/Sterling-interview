/**
 * AI CV context extraction for admins attaching a student's CV. The browser
 * extracts and redacts the text first;
 * this function redacts again, calls the AI provider, and returns a short
 * draft that the student reviews. Nothing is stored here.
 */
import { adminClient, handle, json, requireCaller } from "../_shared/http.ts";
import { getAIProvider } from "../_shared/anthropic.ts";
import { redactPersonalData } from "../_shared/context.ts";

Deno.serve(handle(async (req) => {
  const db = adminClient();
  const caller = await requireCaller(req, db);
  if (!caller || caller.role !== "admin") return json(req, { error: "Administrators only." }, 403);
  const { text } = await req.json().catch(() => ({ text: "" }));
  if (typeof text !== "string" || text.replace(/\s/g, "").length < 40) return json(req, { error: "Not enough text to read." }, 400);
  const provider = getAIProvider();
  if (!provider) return json(req, { available: false });
  try {
    const context = await provider.extractResume(redactPersonalData(text).slice(0, 20_000));
    return json(req, { available: true, context });
  } catch (err) {
    console.error("[ai] resume extraction failed", err instanceof Error ? err.message : err);
    return json(req, { available: true, error: "AI extraction failed" }, 502);
  }
}));
