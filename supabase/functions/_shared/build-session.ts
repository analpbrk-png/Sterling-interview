import type { SupabaseClient } from "./deps.ts";
import { AI_TIMEOUT_MS, getAIProvider, withTimeout } from "./anthropic.ts";
import { buildGenerationContext } from "./context.ts";
import { validateGenerated, type CandidateQuestion } from "./validate.ts";
import { orderForInterview, selectBankQuestions, type BankQuestion } from "./select.ts";
import { buildSessionConfig, type TemplateRow } from "./session-config.ts";

export class BuildError extends Error {
  constructor(public code: string, message: string) { super(message); }
}

export interface InvitationRow {
  id: string;
  university_id: string;
  course_id: string;
  template_id: string | null;
  question_count: number | null;
  ai_question_count: number | null;
  prep_seconds: number | null;
  answer_seconds: number | null;
  submission_mode: "manual" | "automatic" | null;
  allow_early_submit: boolean | null;
  previous_qualification: string | null;
  resume_context: unknown;
  resume_context_status: string;
}

/**
 * Builds one student's full question sequence before the timed interview starts.
 * Uses only this invitation's resume context and the selected university/course.
 */
export async function buildSessionForInvitation(db: SupabaseClient, inv: InvitationRow) {
  const { data: university } = await db.from("universities").select("id, name, country").eq("id", inv.university_id).single();
  const { data: course } = await db.from("courses").select("id, name, level, description, modules, is_verified").eq("id", inv.course_id).single();
  if (!university || !course) throw new BuildError("not_found", "The university or course for this interview no longer exists.");

  let template: (TemplateRow & { id: string }) | null = null;
  if (inv.template_id) template = (await db.from("interview_templates").select("*").eq("id", inv.template_id).maybeSingle()).data;
  if (!template) {
    const { data: ts } = await db.from("interview_templates").select("*")
      .or(`university_id.eq.${university.id},and(university_id.is.null,is_default.eq.true,country.eq.${university.country})`);
    template = (ts?.find((t) => t.university_id === university.id) ?? ts?.[0] ?? null) as (TemplateRow & { id: string }) | null;
  }
  if (!template) throw new BuildError("no_template", `No interview template is configured for ${university.country}.`);
  // Per-student overrides chosen by the admin.
  const t: TemplateRow & { id: string } = {
    ...template,
    question_count: inv.question_count ?? template.question_count,
    ai_question_count: Math.min(inv.ai_question_count ?? template.ai_question_count, inv.question_count ?? template.question_count),
    prep_seconds: inv.prep_seconds ?? template.prep_seconds,
    answer_seconds: inv.answer_seconds ?? template.answer_seconds,
    submission_mode: inv.submission_mode ?? template.submission_mode,
    allow_early_submit: inv.allow_early_submit ?? template.allow_early_submit,
  };
  const timingOverridden = inv.prep_seconds != null || inv.answer_seconds != null || inv.submission_mode != null;

  const { data: settingsRows } = await db.from("admin_settings").select("key, value");
  const settings = Object.fromEntries((settingsRows ?? []).map((r) => [r.key, r.value])) as Record<string, unknown>;
  const aiEnabled = settings.ai_enabled !== false;
  const aiMax = typeof settings.ai_max_questions_per_session === "number" ? settings.ai_max_questions_per_session : 6;

  const { data: bankRows } = await db.from("question_bank")
    .select("id, origin, question_text, question_type, category_id, country, applicable_university_ids, is_active, review_status, is_sensitive, is_mandatory, similarity_group, prep_seconds, answer_seconds, submission_mode")
    .eq("is_active", true).eq("review_status", "approved").eq("country", university.country).eq("question_type", "question");
  const bank = (bankRows ?? []) as BankQuestion[];

  const { data: previous } = await db.from("interview_sessions").select("id").eq("invitation_id", inv.id);
  const recentIds = new Set<string>();
  if (previous?.length) {
    const { data: qs } = await db.from("interview_session_questions").select("question_id").in("session_id", previous.map((p) => p.id));
    qs?.forEach((r) => r.question_id && recentIds.add(r.question_id));
  }

  const provider = aiEnabled ? getAIProvider() : null;
  const aiSlots = provider ? Math.min(t.ai_question_count, aiMax, t.question_count) : 0;
  const pick = (count: number) => selectBankQuestions(bank, {
    country: university.country, universityId: university.id, count, includeSensitive: t.include_sensitive, recentIds,
  });
  const picked = pick(t.question_count - aiSlots);

  let aiQuestions: CandidateQuestion[] = [];
  let notice: string | null = null;
  const aiNeeded = provider ? Math.min(aiMax, t.question_count - picked.length) : 0;
  if (!aiEnabled) notice = "Personalised questions are switched off by the administrator. This session uses approved question-bank questions only.";
  else if (!provider) notice = "AI personalisation is not configured on this server. This session uses approved question-bank questions only.";
  else if (aiNeeded > 0) {
    const { data: details } = await db.from("university_course_details").select("kind, content, is_verified").eq("course_id", course.id);
    // Only this invitation's own background is used.
    const context = buildGenerationContext({
      profile: {
        previous_qualification: inv.previous_qualification,
        resume_context: inv.resume_context,
        resume_context_status: inv.resume_context_status === "none" ? "none" : "confirmed",
      },
      university, course, details: details ?? [],
    });
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
  const finalBank = picked.length + aiQuestions.length < t.question_count ? pick(t.question_count - aiQuestions.length) : picked;

  const aiRows: BankQuestion[] = [];
  if (aiQuestions.length) {
    const { data: inserted } = await db.from("question_bank").insert(aiQuestions.map((q) => ({
      question_text: q.question, origin: "ai_generated", category_id: q.category, country: university.country,
      applicable_university_ids: [university.id], generated_for_course: course.id,
      review_status: "pending_review", is_active: false, review_notes: q.rationale ? `AI rationale: ${q.rationale}` : null,
    }))).select("id");
    aiQuestions.forEach((q, i) => aiRows.push({
      id: inserted?.[i]?.id ?? (null as unknown as string), origin: "ai_generated", question_text: q.question, question_type: "question",
      category_id: q.category, country: university.country, applicable_university_ids: [university.id], is_active: false,
      review_status: "pending_review", is_sensitive: false, is_mandatory: false, similarity_group: null,
      prep_seconds: null, answer_seconds: null, submission_mode: null,
    }));
  }

  const sequence = orderForInterview([...finalBank, ...aiRows]);
  if (!sequence.length) throw new BuildError("empty_question_bank", "No approved questions are available for this university yet. Please contact your adviser.");

  const config = buildSessionConfig(t, Number(settings.tts_rate ?? 0.95));
  const { data: session, error } = await db.from("interview_sessions").insert({
    invitation_id: inv.id, template_id: template.id, university_name: university.name, course_name: course.name,
    generation_mode: aiRows.length ? "bank_and_ai" : "bank_only", generation_notice: notice, config, question_count: sequence.length,
  }).select("id").single();
  if (error || !session) throw new BuildError("storage", "Could not create the interview. Please try again.");
  const { error: qErr } = await db.from("interview_session_questions").insert(sequence.map((q, position) => ({
    session_id: session.id, position, question_id: q.id, question_text: q.question_text, origin: q.origin ?? "manual", category_id: q.category_id,
    // Admin per-student timing overrides win over the bank's per-question timing.
    prep_seconds: timingOverridden && inv.prep_seconds != null ? t.prep_seconds : (q.prep_seconds ?? t.prep_seconds),
    answer_seconds: timingOverridden && inv.answer_seconds != null ? t.answer_seconds : (q.answer_seconds ?? t.answer_seconds),
    submission_mode: inv.submission_mode ?? q.submission_mode ?? t.submission_mode,
  })));
  if (qErr) {
    await db.from("interview_sessions").delete().eq("id", session.id);
    throw new BuildError("storage", "Could not save the question sequence. Please try again.");
  }
  await db.from("interview_events").insert({ session_id: session.id, event_type: "session_created", payload: { bank: finalBank.length, ai: aiRows.length, notice } });
  return session.id as string;
}
