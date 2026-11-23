/**
 * Admin-only AI question generation for a course. Results are saved as
 * pending review. Also answers { action: "status" } so the admin UI can show
 * whether an AI provider is configured (without revealing any key).
 */
import { adminClient, handle, json, requireCaller } from "../_shared/http.ts";
import { getAIProvider } from "../_shared/anthropic.ts";
import { buildGenerationContext } from "../_shared/context.ts";
import { validateGenerated } from "../_shared/validate.ts";

Deno.serve(handle(async (req) => {
  const db = adminClient();
  const caller = await requireCaller(req, db);
  if (!caller || caller.role !== "admin") return json(req, { error: "Administrators only." }, 403);
  const body = await req.json().catch(() => ({}));
  const provider = getAIProvider();
  if (body.action === "status") return json(req, { configured: !!provider, provider: provider?.name ?? null });
  if (!provider) return json(req, { error: "AI is not configured. Set the ANTHROPIC_API_KEY secret in Supabase." }, 400);

  const count = Math.min(10, Math.max(1, Number(body.count) || 5));
  const { data: course } = await db.from("courses").select("id, name, level, description, modules, is_verified, universities(id, name, country)").eq("id", String(body.courseId ?? "")).maybeSingle();
  if (!course) return json(req, { error: "Course not found." }, 404);
  const uni = course.universities as unknown as { id: string; name: string; country: string };
  const { data: details } = await db.from("university_course_details").select("kind, content, is_verified").eq("course_id", course.id);
  const background = typeof body.background === "string" ? body.background.slice(0, 200) : null;
  const context = buildGenerationContext({
    profile: { previous_qualification: background, resume_context: {}, resume_context_status: "none" },
    university: uni, course, details: details ?? [],
  });
  const { data: bank } = await db.from("question_bank").select("question_text").eq("country", uni.country).limit(200);
  const existing = (bank ?? []).map((b) => b.question_text);
  const candidates = await provider.generateQuestions({ context, count, avoid: existing.slice(0, 40), examples: existing.slice(0, 8) });
  const accepted = validateGenerated(candidates, context, existing).accepted.slice(0, count);
  if (!accepted.length) return json(req, { error: "No generated question passed the quality checks. Try again." }, 422);
  await db.from("question_bank").insert(accepted.map((q) => ({
    question_text: q.question, origin: "ai_generated", category_id: q.category, country: uni.country,
    applicable_university_ids: [uni.id], generated_for_course: course.id, review_status: "pending_review",
    is_active: false, created_by: caller.id, review_notes: q.rationale ? `AI rationale: ${q.rationale}` : null,
  })));
  return json(req, { created: accepted.length });
}));
