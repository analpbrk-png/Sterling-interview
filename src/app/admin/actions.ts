"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { extractPdfPages } from "@/lib/questions/pdf-text";
import { parseInterviewPdf } from "@/lib/questions/pdf-parse";
import {
  detectCountryInconsistency,
  detectPolicyConflicts,
  detectSensitivity,
  detectUniversityMention,
  normaliseQuestion,
  similarity,
  DUPLICATE_THRESHOLD,
  SIMILAR_THRESHOLD,
} from "@/lib/questions/analysis";
import { getAIProvider } from "@/lib/ai/provider";
import { buildGenerationContext } from "@/lib/ai/context";
import { validateGenerated } from "@/lib/ai/validate";

function go(path: string, msg: { saved?: string; error?: string }): never {
  const sep = path.includes("?") ? "&" : "?";
  redirect(`${path}${sep}${new URLSearchParams(msg as Record<string, string>).toString()}`);
}
const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const optStr = (f: FormData, k: string) => str(f, k) || null;
const bool = (f: FormData, k: string) => f.get(k) === "on" || f.get(k) === "true";
const int = (f: FormData, k: string) => (str(f, k) === "" ? null : Number.parseInt(str(f, k), 10));
const lines = (f: FormData, k: string) => str(f, k).split(/\r?\n|,/).map((s) => s.trim()).filter(Boolean);

// ---------------------------------------------------------------------------
// Universities & courses
// ---------------------------------------------------------------------------
export async function saveUniversity(form: FormData) {
  await requireAdmin();
  const data = z
    .object({ name: z.string().min(2).max(160), country: z.string().min(2).max(40), city: z.string().max(80).nullable(), website: z.string().url().nullable().or(z.literal(null)) })
    .safeParse({ name: str(form, "name"), country: str(form, "country") || "UK", city: optStr(form, "city"), website: optStr(form, "website") });
  if (!data.success) go("/admin/universities", { error: "Check the university name and website URL." });
  const id = optStr(form, "id");
  const supabase = await createClient();
  const row = { ...data.data, is_active: id ? bool(form, "is_active") : true, notes: optStr(form, "notes") };
  const res = id ? await supabase.from("universities").update(row).eq("id", id).select("id").single() : await supabase.from("universities").insert(row).select("id").single();
  if (res.error) go("/admin/universities", { error: res.error.code === "23505" ? "A university with that name already exists." : "Could not save the university." });
  revalidatePath("/admin/universities");
  go(`/admin/universities/${res.data!.id}`, { saved: "University saved." });
}

export async function deleteUniversity(form: FormData) {
  await requireAdmin();
  const id = z.string().uuid().parse(form.get("id"));
  const supabase = await createClient();
  const { error } = await supabase.from("universities").delete().eq("id", id);
  if (error) go(`/admin/universities/${id}`, { error: "Students have applications for this university. Deactivate it instead." });
  go("/admin/universities", { saved: "University deleted." });
}

export async function saveCourse(form: FormData) {
  const admin = await requireAdmin();
  const universityId = z.string().uuid().parse(form.get("university_id"));
  const id = optStr(form, "id");
  const name = str(form, "name");
  if (name.length < 2) go(`/admin/universities/${universityId}`, { error: "Enter a course name." });
  const url = optStr(form, "official_url");
  if (url && !/^https?:\/\//.test(url)) go(id ? `/admin/courses/${id}` : `/admin/universities/${universityId}`, { error: "Official link must start with http(s)://" });
  const verified = bool(form, "is_verified");
  const row = {
    university_id: universityId,
    name,
    level: optStr(form, "level"),
    description: optStr(form, "description"),
    official_url: url,
    modules: str(form, "modules").split(/\r?\n/).map((m) => m.trim()).filter(Boolean).slice(0, 40),
    is_verified: verified,
    verified_at: verified ? new Date().toISOString() : null,
    verified_by: verified ? admin.id : null,
    is_active: id ? bool(form, "is_active") : true,
  };
  const supabase = await createClient();
  const res = id ? await supabase.from("courses").update(row).eq("id", id).select("id").single() : await supabase.from("courses").insert(row).select("id").single();
  if (res.error) go(`/admin/universities/${universityId}`, { error: res.error.code === "23505" ? "That course already exists at this university." : "Could not save the course." });
  go(`/admin/courses/${res.data!.id}`, { saved: "Course saved." });
}

export async function deleteCourse(form: FormData) {
  await requireAdmin();
  const id = z.string().uuid().parse(form.get("id"));
  const universityId = z.string().uuid().parse(form.get("university_id"));
  const supabase = await createClient();
  const { error } = await supabase.from("courses").delete().eq("id", id);
  if (error) go(`/admin/courses/${id}`, { error: "Students have applied to this course. Deactivate it instead." });
  go(`/admin/universities/${universityId}`, { saved: "Course deleted." });
}

export async function addCourseDetail(form: FormData) {
  await requireAdmin();
  const courseId = z.string().uuid().parse(form.get("course_id"));
  const content = str(form, "content");
  if (content.length < 2) go(`/admin/courses/${courseId}`, { error: "Enter the detail text." });
  const supabase = await createClient();
  await supabase.from("university_course_details").insert({
    course_id: courseId,
    kind: z.enum(["campus", "facilities", "assessment", "teaching", "entry_requirements", "other"]).parse(form.get("kind")),
    content,
    source_url: optStr(form, "source_url"),
    is_verified: bool(form, "is_verified"),
  });
  go(`/admin/courses/${courseId}`, { saved: "Detail added." });
}

export async function deleteCourseDetail(form: FormData) {
  await requireAdmin();
  const id = z.string().uuid().parse(form.get("id"));
  const courseId = z.string().uuid().parse(form.get("course_id"));
  const supabase = await createClient();
  await supabase.from("university_course_details").delete().eq("id", id);
  go(`/admin/courses/${courseId}`, { saved: "Detail removed." });
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------
export async function saveTemplate(form: FormData) {
  await requireAdmin();
  const id = optStr(form, "id");
  const row = {
    name: str(form, "name"),
    country: str(form, "country") || "UK",
    university_id: optStr(form, "university_id"),
    is_default: bool(form, "is_default"),
    identity_enabled: bool(form, "identity_enabled"),
    name_id_step_enabled: bool(form, "name_id_step_enabled"),
    pronunciation_enabled: bool(form, "pronunciation_enabled"),
    pronunciation_words: lines(form, "pronunciation_words").slice(0, 6),
    declaration_enabled: bool(form, "declaration_enabled"),
    declaration_text: optStr(form, "declaration_text"),
    prep_seconds: int(form, "prep_seconds") ?? 20,
    answer_seconds: int(form, "answer_seconds") ?? 60,
    submission_mode: z.enum(["manual", "automatic"]).parse(form.get("submission_mode")),
    allow_early_submit: bool(form, "allow_early_submit"),
    question_count: int(form, "question_count") ?? 12,
    ai_question_count: int(form, "ai_question_count") ?? 0,
    include_sensitive: bool(form, "include_sensitive"),
    tts_default: bool(form, "tts_default"),
  };
  const back = id ? `/admin/templates/${id}` : "/admin/templates/new";
  if (row.name.length < 2) go(back, { error: "Enter a template name." });
  if (row.prep_seconds < 0 || row.prep_seconds > 600 || row.answer_seconds < 10 || row.answer_seconds > 900) go(back, { error: "Preparation must be 0–600 s and answer 10–900 s." });
  if (row.ai_question_count > row.question_count) go(back, { error: "AI questions cannot exceed the total question count." });
  if (row.university_id) row.is_default = false;
  const supabase = await createClient();
  const res = id ? await supabase.from("interview_templates").update(row).eq("id", id).select("id").single() : await supabase.from("interview_templates").insert(row).select("id").single();
  if (res.error) go(back, { error: res.error.code === "23505" ? "That university (or country default) already has a template." : `Could not save: ${res.error.message}` });
  revalidatePath("/admin/templates");
  go(`/admin/templates/${res.data!.id}`, { saved: "Template saved." });
}

export async function deleteTemplate(form: FormData) {
  await requireAdmin();
  const id = z.string().uuid().parse(form.get("id"));
  const supabase = await createClient();
  await supabase.from("interview_templates").delete().eq("id", id);
  go("/admin/templates", { saved: "Template deleted." });
}

// ---------------------------------------------------------------------------
// Questions
// ---------------------------------------------------------------------------
async function similarityInfo(text: string, excludeId?: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("question_bank").select("id, question_text, similarity_group").neq("id", excludeId ?? "00000000-0000-0000-0000-000000000000");
  let best: { id: string; group: string | null; score: number } | null = null;
  for (const q of data ?? []) {
    const s = normaliseQuestion(q.question_text) === normaliseQuestion(text) ? 1 : similarity(q.question_text, text);
    if (!best || s > best.score) best = { id: q.id, group: q.similarity_group, score: s };
  }
  if (!best || best.score < SIMILAR_THRESHOLD) return { group: null, duplicateOf: null, note: null };
  return {
    group: best.group ?? `q-${best.id.slice(0, 8)}`,
    duplicateOf: best.score >= DUPLICATE_THRESHOLD ? best.id : null,
    note: `${best.score >= DUPLICATE_THRESHOLD ? "Duplicate" : "Similar"} to an existing question (score ${best.score.toFixed(2)}).`,
  };
}

export async function saveQuestion(form: FormData) {
  const admin = await requireAdmin();
  const id = optStr(form, "id");
  const text = str(form, "question_text");
  const back = id ? `/admin/questions/${id}` : "/admin/questions/new";
  if (text.length < 5) go(back, { error: "Enter the question text." });
  const intent = str(form, "intent");
  const status = intent === "approve" ? "approved" : intent === "reject" ? "rejected" : (optStr(form, "review_status") ?? "pending_review");
  const unis = form.getAll("applicable_university_ids").map(String).filter(Boolean);
  const mention = detectUniversityMention(text);
  const sens = detectSensitivity(text);
  const row = {
    question_text: text,
    category_id: str(form, "category_id"),
    question_type: z.enum(["question", "identity_instruction", "pronunciation", "declaration"]).parse(form.get("question_type") ?? "question"),
    country: str(form, "country") || "UK",
    applicable_university_ids: unis,
    mentions_university: mention,
    prep_seconds: int(form, "prep_seconds"),
    answer_seconds: int(form, "answer_seconds"),
    submission_mode: optStr(form, "submission_mode") as "manual" | "automatic" | null,
    is_mandatory: bool(form, "is_mandatory"),
    is_sensitive: bool(form, "is_sensitive") || (!id && sens.sensitive),
    sensitivity_reason: optStr(form, "sensitivity_reason") ?? (sens.sensitive ? sens.reason : null),
    review_status: status,
    is_active: status === "approved" ? (intent === "approve" ? true : bool(form, "is_active")) : false,
    review_notes: optStr(form, "review_notes"),
    reviewed_by: intent ? admin.id : undefined,
    reviewed_at: intent ? new Date().toISOString() : undefined,
  };
  if (row.is_active && mention && unis.length === 0) {
    go(back, { error: `This question names ${mention}. Choose the universities it applies to before activating it.` });
  }
  const supabase = await createClient();
  let res;
  if (id) {
    res = await supabase.from("question_bank").update(row).eq("id", id).select("id").single();
  } else {
    const sim = await similarityInfo(text);
    res = await supabase
      .from("question_bank")
      .insert({ ...row, origin: "manual", created_by: admin.id, similarity_group: sim.group, duplicate_of: sim.duplicateOf, review_notes: [row.review_notes, sim.note].filter(Boolean).join("\n") || null })
      .select("id")
      .single();
  }
  if (res.error) go(back, { error: `Could not save: ${res.error.message}` });
  revalidatePath("/admin/questions");
  go(`/admin/questions/${res.data!.id}`, { saved: status === "approved" ? "Question approved and saved." : "Question saved." });
}

export async function bulkReview(form: FormData) {
  const admin = await requireAdmin();
  const ids = form.getAll("ids").map(String).filter((s) => z.string().uuid().safeParse(s).success);
  const intent = str(form, "intent");
  const back = str(form, "back") || "/admin/questions";
  if (!ids.length) go(back, { error: "Select at least one question." });
  const supabase = await createClient();
  if (intent === "approve") {
    // Never auto-activate questions that name a university without applicability set.
    const { data } = await supabase.from("question_bank").select("id, mentions_university, applicable_university_ids").in("id", ids);
    const blocked = (data ?? []).filter((q) => q.mentions_university && !q.applicable_university_ids.length).map((q) => q.id);
    const ok = ids.filter((i) => !blocked.includes(i));
    await supabase.from("question_bank").update({ review_status: "approved", is_active: true, reviewed_by: admin.id, reviewed_at: new Date().toISOString() }).in("id", ok);
    if (blocked.length) await supabase.from("question_bank").update({ review_status: "approved", is_active: false, reviewed_by: admin.id, reviewed_at: new Date().toISOString() }).in("id", blocked);
    go(back, { saved: `${ok.length} approved and activated.${blocked.length ? ` ${blocked.length} name a specific university and stay inactive until you set applicability.` : ""}` });
  }
  if (intent === "reject") {
    await supabase.from("question_bank").update({ review_status: "rejected", is_active: false, reviewed_by: admin.id, reviewed_at: new Date().toISOString() }).in("id", ids);
    go(back, { saved: `${ids.length} rejected.` });
  }
  if (intent === "deactivate") {
    await supabase.from("question_bank").update({ is_active: false }).in("id", ids);
    go(back, { saved: `${ids.length} deactivated.` });
  }
  if (intent === "activate") {
    const { error } = await supabase.from("question_bank").update({ is_active: true }).in("id", ids).eq("review_status", "approved");
    go(back, error ? { error: "Some questions could not be activated (approve them first, and set applicability for university-specific questions)." } : { saved: "Activated approved questions." });
  }
  go(back, { error: "Unknown action." });
}

export async function deleteQuestion(form: FormData) {
  await requireAdmin();
  const id = z.string().uuid().parse(form.get("id"));
  const supabase = await createClient();
  const { data } = await supabase.from("question_bank").select("origin").eq("id", id).single();
  if (data?.origin === "imported") go(`/admin/questions/${id}`, { error: "Imported source records are kept for traceability. Reject or deactivate it instead." });
  await supabase.from("question_bank").delete().eq("id", id);
  go("/admin/questions", { saved: "Question deleted." });
}

/** Parses an uploaded PDF and stores every detected question as pending review. */
export async function importPdf(form: FormData) {
  const admin = await requireAdmin();
  const file = form.get("file");
  if (!(file instanceof File) || !file.size) go("/admin/questions/import", { error: "Choose a PDF file." });
  const f = file as File;
  if (f.size > 15 * 1024 * 1024) go("/admin/questions/import", { error: "PDF is larger than 15 MB." });
  const bytes = new Uint8Array(await f.arrayBuffer());
  if (!(bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46)) go("/admin/questions/import", { error: "That file is not a PDF." });
  const country = str(form, "country") || "UK";

  let pages: string[];
  try {
    pages = await extractPdfPages(bytes);
  } catch {
    go("/admin/questions/import", { error: "Could not read text from this PDF. Scanned (image-only) PDFs are not supported." });
  }
  const { items, skipped } = parseInterviewPdf(pages!);
  if (!items.length) go("/admin/questions/import", { error: "No questions were detected in this PDF." });

  const supabase = await createClient();
  const fileName = f.name.slice(0, 200);
  const { data: source, error: sErr } = await supabase
    .from("question_sources")
    .insert({ file_name: fileName, kind: "pdf", page_count: pages!.length, imported_by: admin.id, notes: `Pages without questions: ${skipped.map((s) => `p${s.page}: ${s.reason}`).join("; ")}` })
    .select("id")
    .single();
  if (sErr) go("/admin/questions/import", { error: "Could not record the import." });

  let inserted = 0;
  let existing = 0;
  for (const it of items) {
    const sens = it.type === "question" ? detectSensitivity(it.sourceText) : { sensitive: false, reason: null };
    const mention = detectUniversityMention(it.sourceText);
    const sim = await similarityInfo(it.questionText);
    const notes = [
      detectCountryInconsistency(it.sourceText, country),
      ...detectPolicyConflicts(it.sourceText),
      mention ? `Mentions ${mention}: set applicable universities before activating.` : null,
      sim.note,
      it.type !== "question" ? "Intro step: configure through interview templates." : null,
    ].filter(Boolean);
    const { error } = await supabase.from("question_bank").insert({
      question_text: it.questionText,
      source_text: it.sourceText,
      source_id: source!.id,
      source_file: fileName,
      source_page: it.page,
      origin: "imported",
      question_type: it.type,
      category_id: it.category,
      country,
      mentions_university: mention,
      prep_seconds: it.prepSeconds,
      answer_seconds: it.answerSeconds,
      submission_mode: it.submissionMode,
      is_sensitive: sens.sensitive,
      sensitivity_reason: sens.reason,
      is_active: false,
      review_status: "pending_review",
      review_notes: notes.join("\n") || null,
      similarity_group: sim.group,
      duplicate_of: sim.duplicateOf,
      created_by: admin.id,
    });
    if (!error) inserted++;
    else if (error.code === "23505") existing++;
  }
  revalidatePath("/admin/questions");
  go("/admin/questions?status=pending_review", {
    saved: `Imported ${inserted} item(s) from ${fileName} for review${existing ? `; ${existing} page(s) were already imported` : ""}. ${skipped.length} page(s) had no question.`,
  });
}

/** Admin-triggered AI generation for a course. Results always need review. */
export async function generateForCourse(form: FormData) {
  const admin = await requireAdmin();
  const courseId = z.string().uuid().parse(form.get("course_id"));
  const count = Math.min(10, Math.max(1, int(form, "count") ?? 5));
  const provider = await getAIProvider();
  if (!provider) go("/admin/questions/generate", { error: "AI is not configured (set ANTHROPIC_API_KEY on the server). Nothing was generated." });
  const db = createAdminClient();
  const { data: course } = await db.from("courses").select("id, name, level, description, modules, is_verified, universities(id, name, country)").eq("id", courseId).single();
  if (!course) go("/admin/questions/generate", { error: "Course not found." });
  const uni = course!.universities as unknown as { id: string; name: string; country: string };
  const { data: details } = await db.from("university_course_details").select("kind, content, is_verified").eq("course_id", courseId);
  const context = buildGenerationContext({
    profile: { previous_qualification: optStr(form, "background"), resume_context: {}, resume_context_status: "none" },
    university: uni,
    course: course!,
    details: details ?? [],
  });
  const { data: bank } = await db.from("question_bank").select("question_text").eq("country", uni.country).limit(200);
  const existingTexts = (bank ?? []).map((b) => b.question_text);
  let accepted;
  try {
    const candidates = await provider!.generateQuestions({ context, count, avoid: existingTexts.slice(0, 40), examples: existingTexts.slice(0, 8) });
    accepted = validateGenerated(candidates, context, existingTexts).accepted.slice(0, count);
  } catch {
    go("/admin/questions/generate", { error: "The AI provider did not respond. Please try again later." });
  }
  if (!accepted!.length) go("/admin/questions/generate", { error: "No generated question passed the quality checks. Try again." });
  await db.from("question_bank").insert(
    accepted!.map((q) => ({
      question_text: q.question,
      origin: "ai_generated",
      category_id: q.category,
      country: uni.country,
      applicable_university_ids: [uni.id],
      generated_for_course: courseId,
      review_status: "pending_review",
      is_active: false,
      created_by: admin.id,
      review_notes: q.rationale ? `AI rationale: ${q.rationale}` : null,
    })),
  );
  go("/admin/questions?origin=ai_generated&status=pending_review", { saved: `${accepted!.length} AI question(s) generated for review.` });
}

// ---------------------------------------------------------------------------
// Settings, students, retention
// ---------------------------------------------------------------------------
export async function saveSettings(form: FormData) {
  const admin = await requireAdmin();
  const supabase = await createClient();
  const values: Record<string, unknown> = {
    ai_enabled: bool(form, "ai_enabled"),
    ai_max_questions_per_session: Math.min(20, Math.max(0, int(form, "ai_max_questions_per_session") ?? 6)),
    tts_rate: Math.min(1.3, Math.max(0.7, Number(str(form, "tts_rate")) || 0.95)),
    document_retention_days: Math.min(3650, Math.max(30, int(form, "document_retention_days") ?? 365)),
  };
  for (const [key, value] of Object.entries(values)) {
    await supabase.from("admin_settings").upsert({ key, value, updated_by: admin.id, updated_at: new Date().toISOString() });
  }
  go("/admin/settings", { saved: "Settings saved." });
}

/** Deletes student documents older than the retention period (files and rows). */
export async function runRetention() {
  await requireAdmin();
  const db = createAdminClient();
  const { data: s } = await db.from("admin_settings").select("value").eq("key", "document_retention_days").maybeSingle();
  const days = Number(s?.value ?? 365);
  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
  const { data: old } = await db.from("student_documents").select("id, storage_path").lt("created_at", cutoff).limit(1000);
  if (old?.length) {
    await db.storage.from("student-documents").remove(old.map((o) => o.storage_path));
    await db.from("student_documents").delete().in("id", old.map((o) => o.id));
  }
  go("/admin/settings", { saved: `Retention run complete: ${old?.length ?? 0} document(s) older than ${days} days deleted.` });
}

export async function setUserRole(form: FormData) {
  const admin = await requireAdmin();
  const id = z.string().uuid().parse(form.get("id"));
  const role = z.enum(["student", "admin"]).parse(form.get("role"));
  if (id === admin.id && role !== "admin") go("/admin/students", { error: "You cannot remove your own admin role." });
  const supabase = await createClient();
  await supabase.from("users").update({ role }).eq("id", id);
  go("/admin/students", { saved: "Role updated." });
}

export async function deleteStudent(form: FormData) {
  const admin = await requireAdmin();
  const id = z.string().uuid().parse(form.get("id"));
  if (id === admin.id) go("/admin/students", { error: "You cannot delete your own account here." });
  const db = createAdminClient();
  const { data: docs } = await db.from("student_documents").select("storage_path").eq("user_id", id);
  if (docs?.length) await db.storage.from("student-documents").remove(docs.map((d) => d.storage_path));
  const { error } = await db.auth.admin.deleteUser(id);
  go("/admin/students", error ? { error: "Could not delete the student." } : { saved: "Student and all their data deleted." });
}
