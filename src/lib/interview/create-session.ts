import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAIProvider, AI_TIMEOUT_MS } from "@/lib/ai/provider";
import { buildGenerationContext } from "@/lib/ai/context";
import { validateGenerated, type CandidateQuestion } from "@/lib/ai/validate";
import { orderForInterview, selectBankQuestions, type BankQuestion } from "@/lib/questions/select";
import { buildSessionConfig, type TemplateRow } from "./config";

export class SessionCreationError extends Error {
  constructor(
    public code: "application_not_found" | "profile_missing" | "no_template" | "empty_question_bank" | "storage",
    message: string,
  ) {
    super(message);
  }
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([p, new Promise<T>((_, reject) => setTimeout(() => reject(new Error("AI request timed out")), ms))]);
}

/**
 * Builds the complete question sequence BEFORE the interview starts, so no AI
 * call can delay or interrupt the timed part. Caller must pass the signed-in
 * user's id; ownership of the application is checked here.
 */
export async function createInterviewSession(userId: string, applicationId: string) {
  const db = createAdminClient();

  const { data: app } = await db
    .from("student_applications")
    .select("id, user_id, university_id, course_id, universities(id, name, country), courses(id, name, level, description, modules, is_verified)")
    .eq("id", applicationId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!app) throw new SessionCreationError("application_not_found", "That application was not found.");
  const university = app.universities as unknown as { id: string; name: string; country: string };
  const course = app.courses as unknown as {
    id: string; name: string; level: string | null; description: string | null; modules: string[]; is_verified: boolean;
  };

  const { data: profile } = await db
    .from("student_profiles")
    .select("previous_qualification, resume_context, resume_context_status")
    .eq("user_id", userId)
    .maybeSingle();
  if (!profile) throw new SessionCreationError("profile_missing", "Complete your profile before starting an interview.");

  const { data: templates } = await db
    .from("interview_templates")
    .select("*")
    .or(`university_id.eq.${university.id},and(university_id.is.null,is_default.eq.true,country.eq.${university.country})`);
  const template = (templates?.find((t) => t.university_id === university.id) ?? templates?.[0]) as TemplateRow | undefined;
  if (!template) throw new SessionCreationError("no_template", `No interview template is configured for ${university.country}.`);

  const { data: settingsRows } = await db.from("admin_settings").select("key, value");
  const settings = Object.fromEntries((settingsRows ?? []).map((r) => [r.key, r.value])) as Record<string, unknown>;
  const aiEnabled = settings.ai_enabled !== false;
  const aiMax = typeof settings.ai_max_questions_per_session === "number" ? settings.ai_max_questions_per_session : 6;

  const { data: bankRows } = await db
    .from("question_bank")
    .select("id, origin, question_text, question_type, category_id, country, applicable_university_ids, is_active, review_status, is_sensitive, is_mandatory, similarity_group, prep_seconds, answer_seconds, submission_mode")
    .eq("is_active", true)
    .eq("review_status", "approved")
    .eq("country", university.country)
    .eq("question_type", "question");
  const bank = (bankRows ?? []) as BankQuestion[];

  // Avoid repeating the last few sessions of this same application.
  const { data: recentSessions } = await db
    .from("interview_sessions")
    .select("id")
    .eq("application_id", app.id)
    .order("created_at", { ascending: false })
    .limit(3);
  const recentIds = new Set<string>();
  if (recentSessions?.length) {
    const { data: recentQs } = await db
      .from("interview_session_questions")
      .select("question_id")
      .in("session_id", recentSessions.map((s) => s.id));
    recentQs?.forEach((r) => r.question_id && recentIds.add(r.question_id));
  }

  const provider = aiEnabled ? await getAIProvider() : null;
  const aiSlots = provider ? Math.min(template.ai_question_count, aiMax, template.question_count) : 0;
  const picked = selectBankQuestions(bank, {
    country: university.country,
    universityId: university.id,
    count: template.question_count - aiSlots,
    includeSensitive: template.include_sensitive,
    recentIds,
  });

  let aiQuestions: CandidateQuestion[] = [];
  let notice: string | null = null;
  const aiNeeded = provider ? Math.min(aiMax, template.question_count - picked.length) : 0;
  if (!aiEnabled) {
    notice = "Personalised questions are switched off by the administrator. This session uses approved question-bank questions only.";
  } else if (!provider) {
    notice = "AI personalisation is not configured on this server. This session uses approved question-bank questions only.";
  } else if (aiNeeded > 0) {
    const context = buildGenerationContext({
      profile,
      university,
      course,
      details: (
        await db.from("university_course_details").select("kind, content, is_verified").eq("course_id", course.id)
      ).data ?? [],
    });
    try {
      const candidates = await withTimeout(
        provider.generateQuestions({
          context,
          count: aiNeeded,
          avoid: picked.map((p) => p.question_text),
          examples: bank.slice(0, 8).map((b) => b.question_text),
        }),
        AI_TIMEOUT_MS + 2000,
      );
      aiQuestions = validateGenerated(candidates, context, picked.map((p) => p.question_text)).accepted.slice(0, aiNeeded);
      if (aiQuestions.length < aiNeeded) {
        notice = "Fewer personalised questions than planned passed our quality checks; the rest come from the approved question bank.";
      }
    } catch (err) {
      console.error("[ai] question generation failed", err instanceof Error ? err.message : err);
      notice = "AI personalisation was temporarily unavailable. This session uses approved question-bank questions only.";
    }
  }

  // If AI produced fewer questions than reserved, top up from the bank.
  let finalBank = picked;
  if (picked.length + aiQuestions.length < template.question_count) {
    finalBank = selectBankQuestions(bank, {
      country: university.country,
      universityId: university.id,
      count: template.question_count - aiQuestions.length,
      includeSensitive: template.include_sensitive,
      recentIds,
    });
  }

  // Log AI questions in the bank as pending review (never auto-approved).
  const aiRows: Array<{ id: string | null; question_text: string; category_id: string; origin: "ai_generated" }> = [];
  if (aiQuestions.length) {
    const { data: inserted } = await db
      .from("question_bank")
      .insert(
        aiQuestions.map((q) => ({
          question_text: q.question,
          origin: "ai_generated",
          category_id: q.category,
          country: university.country,
          applicable_university_ids: [university.id],
          generated_for_course: course.id,
          review_status: "pending_review",
          is_active: false,
          review_notes: q.rationale ? `AI rationale: ${q.rationale}` : null,
        })),
      )
      .select("id, question_text, category_id");
    aiQuestions.forEach((q, i) =>
      aiRows.push({ id: inserted?.[i]?.id ?? null, question_text: q.question, category_id: q.category, origin: "ai_generated" }),
    );
  }

  const sequence = orderForInterview([
    ...finalBank,
    ...aiRows.map((a) => ({ ...a, prep_seconds: null, answer_seconds: null, submission_mode: null })),
  ]);
  if (sequence.length === 0) {
    throw new SessionCreationError(
      "empty_question_bank",
      "No approved questions are available for this university yet. Please ask your administrator to review the question bank.",
    );
  }

  const config = buildSessionConfig(template, Number(settings.tts_rate ?? 0.95));
  const { data: session, error: sErr } = await db
    .from("interview_sessions")
    .insert({
      user_id: userId,
      application_id: app.id,
      template_id: template.id,
      university_name: university.name,
      course_name: course.name,
      generation_mode: aiRows.length ? "bank_and_ai" : "bank_only",
      generation_notice: notice,
      config,
      question_count: sequence.length,
    })
    .select("id")
    .single();
  if (sErr || !session) throw new SessionCreationError("storage", "Could not create the session. Please try again.");

  const { error: qErr } = await db.from("interview_session_questions").insert(
    sequence.map((q, position) => ({
      session_id: session.id,
      position,
      question_id: q.id,
      question_text: q.question_text,
      origin: q.origin ?? "manual",
      category_id: q.category_id,
      prep_seconds: q.prep_seconds ?? template.prep_seconds,
      answer_seconds: q.answer_seconds ?? template.answer_seconds,
      submission_mode: q.submission_mode ?? template.submission_mode,
    })),
  );
  if (qErr) {
    await db.from("interview_sessions").delete().eq("id", session.id);
    throw new SessionCreationError("storage", "Could not save the question sequence. Please try again.");
  }
  await db.from("interview_events").insert({
    session_id: session.id,
    user_id: userId,
    event_type: "session_created",
    payload: { bank: finalBank.length, ai: aiRows.length, notice },
  });
  return { sessionId: session.id as string, notice };
}
