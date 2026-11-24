import type { SupabaseClient } from "./deps.ts";
import { AI_TIMEOUT_MS, getAIProvider, withTimeout } from "./anthropic.ts";
import { buildGenerationContext, sanitiseResumeContext } from "./context.ts";
import { templateQuestions } from "./template-questions.ts";
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
  bank_question_count: number | null;
  personal_question_count: number | null;
  course_question_count: number | null;
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
    .eq("is_active", true).eq("review_status", "approved").eq("country", university.country).eq("question_type", "question").is("invitation_id", null);
  const bank = (bankRows ?? []) as BankQuestion[];

  const { data: previous } = await db.from("interview_sessions").select("id").eq("invitation_id", inv.id);
  const recentIds = new Set<string>();
  if (previous?.length) {
    const { data: qs } = await db.from("interview_session_questions").select("question_id").in("session_id", previous.map((p) => p.id));
    qs?.forEach((r) => r.question_id && recentIds.add(r.question_id));
  }

  // ---- Question mix for this interview (admin-configurable; 15 → 9 bank / 4 personal / 2 course) ----
  const total = inv.question_count ?? t.question_count;
  const dPersonal = Math.round((total * 4) / 15);
  const dCourse = Math.round((total * 2) / 15);
  const personalN = aiEnabled ? (inv.personal_question_count ?? dPersonal) : 0;
  const courseN = inv.course_question_count ?? dCourse;
  const bankN = inv.bank_question_count ?? Math.max(0, total - personalN - courseN);

  // Questions the admin generated with the free local AI and saved for THIS invitation only.
  const { data: plannedRows } = await db.from("question_bank")
    .select("id, origin, question_text, question_type, category_id, country, applicable_university_ids, is_active, review_status, is_sensitive, is_mandatory, similarity_group, prep_seconds, answer_seconds, submission_mode, ai_kind")
    .eq("invitation_id", inv.id).eq("review_status", "approved");
  const shuffle = <T,>(a: T[]) => a.map((x) => [Math.random(), x] as const).sort((p, q) => p[0] - q[0]).map((p) => p[1]);
  const planned = shuffle((plannedRows ?? []) as Array<BankQuestion & { ai_kind: string | null }>);
  const personal: BankQuestion[] = aiEnabled ? planned.filter((q) => q.ai_kind === "personal").slice(0, personalN) : [];
  const courseAi: BankQuestion[] = planned.filter((q) => q.ai_kind === "course").slice(0, courseN);

  const used = new Set<string>();
  const usedGroups = new Set<string>();
  const take = (qs: BankQuestion[]) => { qs.forEach((q) => { used.add(q.id); if (q.similarity_group) usedGroups.add(q.similarity_group); }); return qs; };
  const remaining = () => bank.filter((q) => !used.has(q.id) && !(q.similarity_group && usedGroups.has(q.similarity_group)));

  // Personal shortfall: optional server AI, then labelled templates (never called AI).
  let aiQuestions: CandidateQuestion[] = [];
  const templateRows: BankQuestion[] = [];
  const personalShort = personalN - personal.length;
  const provider = aiEnabled && personalShort > 0 ? getAIProvider() : null;
  const resumeStatus = inv.resume_context_status === "none" ? "none" : "confirmed";
  if (provider) {
    const { data: details } = await db.from("university_course_details").select("kind, content, is_verified").eq("course_id", course.id);
    const context = buildGenerationContext({ profile: { previous_qualification: inv.previous_qualification, resume_context: inv.resume_context, resume_context_status: resumeStatus }, university, course, details: details ?? [] });
    try {
      const candidates = await withTimeout(provider.generateQuestions({ context, count: personalShort, avoid: bank.slice(0, 30).map((b) => b.question_text), examples: bank.slice(0, 8).map((b) => b.question_text) }), AI_TIMEOUT_MS + 2000);
      aiQuestions = validateGenerated(candidates, context, bank.map((b) => b.question_text)).accepted.slice(0, personalShort);
    } catch (err) {
      console.error("[ai] generation failed", err instanceof Error ? err.message : err);
    }
  }
  if (aiEnabled && personal.length + aiQuestions.length < personalN) {
    const ctx = sanitiseResumeContext(inv.resume_context);
    for (const tq of templateQuestions(ctx, inv.previous_qualification, course.name, personalN - personal.length - aiQuestions.length)) {
      templateRows.push({
        id: null as unknown as string, origin: "template" as BankQuestion["origin"], question_text: tq.question, question_type: "question",
        category_id: tq.category, country: university.country, applicable_university_ids: [], is_active: false, review_status: "approved",
        is_sensitive: false, is_mandatory: false, similarity_group: null, prep_seconds: null, answer_seconds: null, submission_mode: null,
      });
    }
  }

  take([...personal, ...courseAi]);
  // Course shortfall: course/university questions from the PDF bank, preferring ones restricted to this university.
  const COURSE_CATS = new Set(["why_course", "course_modules", "why_university", "university_research"]);
  const courseShort = courseN - courseAi.length;
  const courseBank = courseShort > 0
    ? take(selectBankQuestions(remaining().filter((q) => COURSE_CATS.has(q.category_id)).sort((a, b) => b.applicable_university_ids.length - a.applicable_university_ids.length), {
        country: university.country, universityId: university.id, count: courseShort, includeSensitive: t.include_sensitive, recentIds,
      }))
    : [];
  const personalFilled = personal.length + aiQuestions.length + templateRows.length;
  const bankCount = bankN + (personalN - personalFilled) + (courseShort - courseBank.length);
  const general = take(selectBankQuestions(remaining(), { country: university.country, universityId: university.id, count: bankCount, includeSensitive: t.include_sensitive, recentIds }));

  const aiRows: BankQuestion[] = [];
  if (aiQuestions.length) {
    const { data: inserted } = await db.from("question_bank").insert(aiQuestions.map((q) => ({
      question_text: q.question, origin: "ai_generated", category_id: q.category, country: university.country,
      applicable_university_ids: [university.id], generated_for_course: course.id, invitation_id: inv.id, ai_kind: "personal",
      review_status: "pending_review", is_active: false, review_notes: q.rationale ? `AI rationale: ${q.rationale}` : null,
    }))).select("id");
    aiQuestions.forEach((q, i) => aiRows.push({
      id: inserted?.[i]?.id ?? (null as unknown as string), origin: "ai_generated", question_text: q.question, question_type: "question",
      category_id: q.category, country: university.country, applicable_university_ids: [university.id], is_active: false,
      review_status: "pending_review", is_sensitive: false, is_mandatory: false, similarity_group: null,
      prep_seconds: null, answer_seconds: null, submission_mode: null,
    }));
  }

  const finalBank = [...courseBank, ...general];
  const aiCount = personal.length + courseAi.length + aiRows.length;
  const sequence = orderForInterview(shuffle([...finalBank, ...personal, ...courseAi, ...aiRows, ...templateRows]));
  if (!sequence.length) throw new BuildError("empty_question_bank", "No approved questions are available for this university yet. Please contact your adviser.");

  const parts = [`${finalBank.length} from the interview question bank`];
  if (aiCount) parts.push(`${aiCount} personalised for you`);
  if (templateRows.length) parts.push(`${templateRows.length} based on your background (standard templates)`);
  let notice: string | null = sequence.length < total
    ? `This interview has ${sequence.length} questions (${parts.join(", ")}): fewer than the ${total} planned because not enough different approved questions were available.`
    : null;
  if (!aiEnabled) notice = "Personalised questions are switched off by the administrator. This interview uses the question bank only.";
  const mode = aiCount && templateRows.length ? "bank_ai_template" : aiCount ? "bank_and_ai" : templateRows.length ? "bank_and_template" : "bank_only";

  const config = buildSessionConfig(t, Number(settings.tts_rate ?? 0.95));
  const { data: session, error } = await db.from("interview_sessions").insert({
    invitation_id: inv.id, template_id: template.id, university_name: university.name, course_name: course.name,
    generation_mode: mode, generation_notice: notice, config, question_count: sequence.length,
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
  await db.from("interview_events").insert({ session_id: session.id, event_type: "session_created", payload: { bank: finalBank.length, ai: aiCount, template: templateRows.length, planned: total, notice } });
  return session.id as string;
}
