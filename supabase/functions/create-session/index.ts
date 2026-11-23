/**
 * Builds a student's complete question sequence before the timed interview
 * starts, so no AI call can interrupt it. Runs with the service role after
 * verifying the caller owns the application.
 */
import { adminClient, handle, json, requireCaller } from "../_shared/http.ts";
import { AI_TIMEOUT_MS, getAIProvider, withTimeout } from "../_shared/anthropic.ts";
import { buildGenerationContext } from "../_shared/context.ts";
import { validateGenerated, type CandidateQuestion } from "../_shared/validate.ts";
import { orderForInterview, selectBankQuestions, type BankQuestion } from "../_shared/select.ts";
import { buildSessionConfig, type TemplateRow } from "../_shared/session-config.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(handle(async (req) => {
  const db = adminClient();
  const caller = await requireCaller(req, db);
  if (!caller) return json(req, { code: "unauthorised", error: "Please sign in again." }, 401);
  const body = await req.json().catch(() => ({}));
  const applicationId = String(body.applicationId ?? "");
  if (!UUID.test(applicationId)) return json(req, { code: "application_not_found", error: "That application was not found." }, 404);

  const { data: app } = await db
    .from("student_applications")
    .select("id, user_id, universities(id, name, country), courses(id, name, level, description, modules, is_verified)")
    .eq("id", applicationId)
    .eq("user_id", caller.id)
    .maybeSingle();
  if (!app) return json(req, { code: "application_not_found", error: "That application was not found." }, 404);
  const university = app.universities as unknown as { id: string; name: string; country: string };
  const course = app.courses as unknown as { id: string; name: string; level: string | null; description: string | null; modules: string[]; is_verified: boolean };

  const { data: profile } = await db.from("student_profiles").select("previous_qualification, resume_context, resume_context_status").eq("user_id", caller.id).maybeSingle();
  if (!profile) return json(req, { code: "profile_missing", error: "Complete your profile before starting an interview." }, 400);

  const { data: templates } = await db
    .from("interview_templates")
    .select("*")
    .or(`university_id.eq.${university.id},and(university_id.is.null,is_default.eq.true,country.eq.${university.country})`);
  const template = (templates?.find((t) => t.university_id === university.id) ?? templates?.[0]) as (TemplateRow & { id: string }) | undefined;
  if (!template) return json(req, { code: "no_template", error: `No interview template is configured for ${university.country}.` }, 400);

  const { data: settingsRows } = await db.from("admin_settings").select("key, value");
  const settings = Object.fromEntries((settingsRows ?? []).map((r) => [r.key, r.value])) as Record<string, unknown>;
  const aiEnabled = settings.ai_enabled !== false;
  const aiMax = typeof settings.ai_max_questions_per_session === "number" ? settings.ai_max_questions_per_session : 6;

  const { data: bankRows } = await db
    .from("question_bank")
    .select("id, origin, question_text, question_type, category_id, country, applicable_university_ids, is_active, review_status, is_sensitive, is_mandatory, similarity_group, prep_seconds, answer_seconds, submission_mode")
    .eq("is_active", true).eq("review_status", "approved").eq("country", university.country).eq("question_type", "question");
  const bank = (bankRows ?? []) as BankQuestion[];

  const { data: recentSessions } = await db.from("interview_sessions").select("id").eq("application_id", app.id).order("created_at", { ascending: false }).limit(3);
  const recentIds = new Set<string>();
  if (recentSessions?.length) {
    const { data: recentQs } = await db.from("interview_session_questions").select("question_id").in("session_id", recentSessions.map((s) => s.id));
    recentQs?.forEach((r) => r.question_id && recentIds.add(r.question_id));
  }

  const provider = aiEnabled ? getAIProvider() : null;
  const aiSlots = provider ? Math.min(template.ai_question_count, aiMax, template.question_count) : 0;
  const pick = (count: number) => selectBankQuestions(bank, {
    country: university.country, universityId: university.id, count, includeSensitive: template.include_sensitive, recentIds,
  });
  const picked = pick(template.question_count - aiSlots);

  let aiQuestions: CandidateQuestion[] = [];
  let notice: string | null = null;
  const aiNeeded = provider ? Math.min(aiMax, template.question_count - picked.length) : 0;
  if (!aiEnabled) {
    notice = "Personalised questions are switched off by the administrator. This session uses approved question-bank questions only.";
  } else if (!provider) {
    notice = "AI personalisation is not configured on this server. This session uses approved question-bank questions only.";
  } else if (aiNeeded > 0) {
    const { data: details } = await db.from("university_course_details").select("kind, content, is_verified").eq("course_id", course.id);
    const context = buildGenerationContext({ profile, university, course, details: details ?? [] });
    try {
      const candidates = await withTimeout(
        provider.generateQuestions({ context, count: aiNeeded, avoid: picked.map((p) => p.question_text), examples: bank.slice(0, 8).map((b) => b.question_text) }),
        AI_TIMEOUT_MS + 2000,
      );
      aiQuestions = validateGenerated(candidates, context, picked.map((p) => p.question_text)).accepted.slice(0, aiNeeded);
      if (aiQuestions.length < aiNeeded) notice = "Fewer personalised questions than planned passed our quality checks; the rest come from the approved question bank.";
    } catch (err) {
      console.error("[ai] generation failed", err instanceof Error ? err.message : err);
      notice = "AI personalisation was temporarily unavailable. This session uses approved question-bank questions only.";
    }
  }

  const finalBank = picked.length + aiQuestions.length < template.question_count ? pick(template.question_count - aiQuestions.length) : picked;

  // AI questions are logged in the bank for admin review, never auto-approved.
  const aiRows: Array<BankQuestion> = [];
  if (aiQuestions.length) {
    const { data: inserted } = await db.from("question_bank").insert(aiQuestions.map((q) => ({
      question_text: q.question, origin: "ai_generated", category_id: q.category, country: university.country,
      applicable_university_ids: [university.id], generated_for_course: course.id,
      review_status: "pending_review", is_active: false, review_notes: q.rationale ? `AI rationale: ${q.rationale}` : null,
    }))).select("id");
    aiQuestions.forEach((q, i) => aiRows.push({
      id: inserted?.[i]?.id ?? null as unknown as string, origin: "ai_generated", question_text: q.question, question_type: "question",
      category_id: q.category, country: university.country, applicable_university_ids: [university.id], is_active: false,
      review_status: "pending_review", is_sensitive: false, is_mandatory: false, similarity_group: null,
      prep_seconds: null, answer_seconds: null, submission_mode: null,
    }));
  }

  const sequence = orderForInterview([...finalBank, ...aiRows]);
  if (!sequence.length) {
    return json(req, { code: "empty_question_bank", error: "No approved questions are available for this university yet. Please ask your administrator to review the question bank." }, 400);
  }

  const config = buildSessionConfig(template, Number(settings.tts_rate ?? 0.95));
  const { data: session, error: sErr } = await db.from("interview_sessions").insert({
    user_id: caller.id, application_id: app.id, template_id: template.id,
    university_name: university.name, course_name: course.name,
    generation_mode: aiRows.length ? "bank_and_ai" : "bank_only", generation_notice: notice, config, question_count: sequence.length,
  }).select("id").single();
  if (sErr || !session) return json(req, { code: "storage", error: "Could not create the session. Please try again." }, 500);

  const { error: qErr } = await db.from("interview_session_questions").insert(sequence.map((q, position) => ({
    session_id: session.id, position, question_id: q.id, question_text: q.question_text,
    origin: q.origin ?? "manual", category_id: q.category_id,
    prep_seconds: q.prep_seconds ?? template.prep_seconds,
    answer_seconds: q.answer_seconds ?? template.answer_seconds,
    submission_mode: q.submission_mode ?? template.submission_mode,
  })));
  if (qErr) {
    await db.from("interview_sessions").delete().eq("id", session.id);
    return json(req, { code: "storage", error: "Could not save the question sequence. Please try again." }, 500);
  }
  await db.from("interview_events").insert({ session_id: session.id, user_id: caller.id, event_type: "session_created", payload: { bank: finalBank.length, ai: aiRows.length, notice } });
  return json(req, { sessionId: session.id, notice });
}));
