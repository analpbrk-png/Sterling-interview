"use client";
/**
 * Admin operations, run in the browser as the signed-in admin. Row level
 * security allows these writes only for users whose role is admin, so a
 * student calling them gets nothing back.
 */
import { z } from "zod";
import { createClient } from "@/lib/supabase/client";
import { fbool, fint, fopt, fstr } from "@/lib/use-action";
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

const db = () => createClient();
const fail = (msg: string): never => { throw new Error(msg); };
const lines = (f: FormData, k: string) => fstr(f, k).split(/\r?\n|,/).map((s) => s.trim()).filter(Boolean);

// ---------------------------------------------------------------------------
// Universities & courses
// ---------------------------------------------------------------------------
export async function saveUniversity(form: FormData): Promise<string> {
  const id = fopt(form, "id");
  const parsed = z.object({
    name: z.string().min(2).max(160),
    country: z.string().min(2).max(40),
    city: z.string().max(80).nullable(),
    website: z.string().url().nullable(),
  }).safeParse({ name: fstr(form, "name"), country: fstr(form, "country") || "UK", city: fopt(form, "city"), website: fopt(form, "website") });
  if (!parsed.success) fail("Check the university name and website URL.");
  const row = { ...parsed.data!, is_active: id ? fbool(form, "is_active") : true, notes: fopt(form, "notes") };
  const res = id ? await db().from("universities").update(row).eq("id", id).select("id").single() : await db().from("universities").insert(row).select("id").single();
  if (res.error) fail(res.error.code === "23505" ? "A university with that name already exists." : "Could not save the university.");
  return res.data!.id;
}

export async function deleteUniversity(id: string) {
  const { error } = await db().from("universities").delete().eq("id", id);
  if (error) fail("Students have applications for this university. Deactivate it instead.");
}

export async function saveCourse(form: FormData, adminId: string): Promise<string> {
  const universityId = z.string().uuid().parse(form.get("university_id"));
  const id = fopt(form, "id");
  const name = fstr(form, "name");
  if (name.length < 2) fail("Enter a course name.");
  const url = fopt(form, "official_url");
  if (url && !/^https?:\/\//.test(url)) fail("Official link must start with http(s)://");
  const verified = fbool(form, "is_verified");
  const row: Record<string, unknown> = {
    university_id: universityId, name, level: fopt(form, "level"), official_url: url,
    is_verified: verified, verified_at: verified ? new Date().toISOString() : null, verified_by: verified ? adminId : null,
    is_active: id ? fbool(form, "is_active") : true,
  };
  if (form.has("description")) row.description = fopt(form, "description");
  if (form.has("modules")) row.modules = fstr(form, "modules").split(/\r?\n/).map((m) => m.trim()).filter(Boolean).slice(0, 40);
  const res = id ? await db().from("courses").update(row).eq("id", id).select("id").single() : await db().from("courses").insert(row).select("id").single();
  if (res.error) fail(res.error.code === "23505" ? "That course already exists at this university." : "Could not save the course.");
  return res.data!.id;
}

export async function deleteCourse(id: string) {
  const { error } = await db().from("courses").delete().eq("id", id);
  if (error) fail("Students have applied to this course. Deactivate it instead.");
}

export async function addCourseDetail(form: FormData) {
  const content = fstr(form, "content");
  if (content.length < 2) fail("Enter the detail text.");
  const { error } = await db().from("university_course_details").insert({
    course_id: z.string().uuid().parse(form.get("course_id")),
    kind: z.enum(["campus", "facilities", "assessment", "teaching", "entry_requirements", "other"]).parse(form.get("kind")),
    content, source_url: fopt(form, "source_url"), is_verified: fbool(form, "is_verified"),
  });
  if (error) fail("Could not add the detail.");
}

export async function deleteCourseDetail(id: string) {
  await db().from("university_course_details").delete().eq("id", id);
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------
export async function saveTemplate(form: FormData): Promise<string> {
  const id = fopt(form, "id");
  const row = {
    name: fstr(form, "name"),
    country: fstr(form, "country") || "UK",
    university_id: fopt(form, "university_id"),
    is_default: fbool(form, "is_default"),
    identity_enabled: fbool(form, "identity_enabled"),
    name_id_step_enabled: fbool(form, "name_id_step_enabled"),
    pronunciation_enabled: fbool(form, "pronunciation_enabled"),
    pronunciation_words: lines(form, "pronunciation_words").slice(0, 6),
    declaration_enabled: fbool(form, "declaration_enabled"),
    declaration_text: fopt(form, "declaration_text"),
    prep_seconds: fint(form, "prep_seconds") ?? 20,
    answer_seconds: fint(form, "answer_seconds") ?? 60,
    submission_mode: z.enum(["manual", "automatic"]).parse(form.get("submission_mode")),
    allow_early_submit: fbool(form, "allow_early_submit"),
    question_count: fint(form, "question_count") ?? 12,
    ai_question_count: fint(form, "ai_question_count") ?? 0,
    include_sensitive: fbool(form, "include_sensitive"),
    tts_default: fbool(form, "tts_default"),
  };
  if (row.name.length < 2) fail("Enter a template name.");
  if (row.prep_seconds < 0 || row.prep_seconds > 600 || row.answer_seconds < 10 || row.answer_seconds > 900) fail("Preparation must be 0–600 s and answer 10–900 s.");
  if (row.ai_question_count > row.question_count) fail("AI questions cannot exceed the total question count.");
  if (row.university_id) row.is_default = false;
  const res = id ? await db().from("interview_templates").update(row).eq("id", id).select("id").single() : await db().from("interview_templates").insert(row).select("id").single();
  if (res.error) fail(res.error.code === "23505" ? "That university (or country default) already has a template." : `Could not save: ${res.error.message}`);
  return res.data!.id;
}

export async function deleteTemplate(id: string) {
  await db().from("interview_templates").delete().eq("id", id);
}

// ---------------------------------------------------------------------------
// Questions
// ---------------------------------------------------------------------------
type BankLite = { id: string; question_text: string; similarity_group: string | null };

export function similarityInfo(text: string, bank: BankLite[], excludeId?: string) {
  let best: { id: string; group: string | null; score: number } | null = null;
  for (const q of bank) {
    if (q.id === excludeId) continue;
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

async function loadBankLite(): Promise<BankLite[]> {
  const { data } = await db().from("question_bank").select("id, question_text, similarity_group");
  return data ?? [];
}

export async function saveQuestion(form: FormData, intent: "approve" | "reject" | "", adminId: string): Promise<string> {
  const id = fopt(form, "id");
  const text = fstr(form, "question_text");
  if (text.length < 5) fail("Enter the question text.");
  const status = intent === "approve" ? "approved" : intent === "reject" ? "rejected" : (fopt(form, "review_status") ?? "pending_review");
  const unis = form.getAll("applicable_university_ids").map(String).filter(Boolean);
  const mention = detectUniversityMention(text);
  const sens = detectSensitivity(text);
  const row: Record<string, unknown> = {
    question_text: text,
    category_id: fstr(form, "category_id"),
    question_type: z.enum(["question", "identity_instruction", "pronunciation", "declaration"]).parse(form.get("question_type") ?? "question"),
    country: fstr(form, "country") || "UK",
    applicable_university_ids: unis,
    mentions_university: mention,
    prep_seconds: fint(form, "prep_seconds"),
    answer_seconds: fint(form, "answer_seconds"),
    submission_mode: fopt(form, "submission_mode"),
    is_mandatory: fbool(form, "is_mandatory"),
    is_sensitive: fbool(form, "is_sensitive") || (!id && sens.sensitive),
    sensitivity_reason: fopt(form, "sensitivity_reason") ?? (sens.sensitive ? sens.reason : null),
    review_status: status,
    is_active: status === "approved" ? (intent === "approve" ? true : fbool(form, "is_active")) : false,
    review_notes: fopt(form, "review_notes"),
  };
  if (intent) { row.reviewed_by = adminId; row.reviewed_at = new Date().toISOString(); }
  if (row.is_active && mention && unis.length === 0) fail(`This question names ${mention}. Choose the universities it applies to before activating it.`);
  let res;
  if (id) {
    res = await db().from("question_bank").update(row).eq("id", id).select("id").single();
  } else {
    const sim = similarityInfo(text, await loadBankLite());
    res = await db().from("question_bank").insert({
      ...row, origin: "manual", created_by: adminId, similarity_group: sim.group, duplicate_of: sim.duplicateOf,
      review_notes: [row.review_notes, sim.note].filter(Boolean).join("\n") || null,
    }).select("id").single();
  }
  if (res.error) fail(`Could not save: ${res.error.message}`);
  return res.data!.id;
}

export async function bulkReview(ids: string[], intent: "approve" | "reject" | "deactivate", adminId: string): Promise<string> {
  if (!ids.length) fail("Select at least one question.");
  const now = new Date().toISOString();
  if (intent === "approve") {
    // Never auto-activate questions that name a university without applicability set.
    const { data } = await db().from("question_bank").select("id, mentions_university, applicable_university_ids").in("id", ids);
    const blocked = (data ?? []).filter((q) => q.mentions_university && !q.applicable_university_ids.length).map((q) => q.id);
    const ok = ids.filter((i) => !blocked.includes(i));
    if (ok.length) await db().from("question_bank").update({ review_status: "approved", is_active: true, reviewed_by: adminId, reviewed_at: now }).in("id", ok);
    if (blocked.length) await db().from("question_bank").update({ review_status: "approved", is_active: false, reviewed_by: adminId, reviewed_at: now }).in("id", blocked);
    return `${ok.length} approved and activated.${blocked.length ? ` ${blocked.length} name a specific university and stay inactive until you set applicability.` : ""}`;
  }
  if (intent === "reject") {
    await db().from("question_bank").update({ review_status: "rejected", is_active: false, reviewed_by: adminId, reviewed_at: now }).in("id", ids);
    return `${ids.length} rejected.`;
  }
  await db().from("question_bank").update({ is_active: false }).in("id", ids);
  return `${ids.length} deactivated.`;
}

export async function deleteQuestion(id: string, origin: string) {
  if (origin === "imported") fail("Imported source records are kept for traceability. Reject or deactivate it instead.");
  await db().from("question_bank").delete().eq("id", id);
}

/** Reads a PDF in the browser and stores every detected item as pending review. */
export async function importPdf(file: File, country: string, adminId: string): Promise<string> {
  if (!file.size) fail("Choose a PDF file.");
  if (file.size > 15 * 1024 * 1024) fail("PDF is larger than 15 MB.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!(bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46)) fail("That file is not a PDF.");
  let pages: string[] = [];
  try {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(bytes);
    if (pdf.numPages > 200) fail("PDF has more than 200 pages.");
    pages = (await extractText(pdf, { mergePages: false })).text as string[];
  } catch (e) {
    if (e instanceof Error && e.message.includes("200 pages")) throw e;
    fail("Could not read text from this PDF. Scanned (image-only) PDFs are not supported.");
  }
  const { items, skipped } = parseInterviewPdf(pages);
  if (!items.length) fail("No questions were detected in this PDF.");

  const fileName = file.name.slice(0, 200);
  const { data: source, error: sErr } = await db().from("question_sources").insert({
    file_name: fileName, kind: "pdf", page_count: pages.length, imported_by: adminId,
    notes: `Pages without questions: ${skipped.map((s) => `p${s.page}: ${s.reason}`).join("; ")}`,
  }).select("id").single();
  if (sErr) fail("Could not record the import.");

  const bank = await loadBankLite();
  let inserted = 0;
  let existing = 0;
  for (const it of items) {
    const sens = it.type === "question" ? detectSensitivity(it.sourceText) : { sensitive: false, reason: null };
    const mention = detectUniversityMention(it.sourceText);
    const sim = similarityInfo(it.questionText, bank);
    const notes = [
      detectCountryInconsistency(it.sourceText, country),
      ...detectPolicyConflicts(it.sourceText),
      mention ? `Mentions ${mention}: set applicable universities before activating.` : null,
      sim.note,
      it.type !== "question" ? "Intro step: configure through interview templates." : null,
    ].filter(Boolean);
    const { data, error } = await db().from("question_bank").insert({
      question_text: it.questionText, source_text: it.sourceText, source_id: source!.id, source_file: fileName, source_page: it.page,
      origin: "imported", question_type: it.type, category_id: it.category, country, mentions_university: mention,
      prep_seconds: it.prepSeconds, answer_seconds: it.answerSeconds, submission_mode: it.submissionMode,
      is_sensitive: sens.sensitive, sensitivity_reason: sens.reason, is_active: false, review_status: "pending_review",
      review_notes: notes.join("\n") || null, similarity_group: sim.group, duplicate_of: sim.duplicateOf, created_by: adminId,
    }).select("id, question_text, similarity_group").single();
    if (!error && data) { inserted++; bank.push(data); }
    else if (error?.code === "23505") existing++;
  }
  return `Imported ${inserted} item(s) from ${fileName} for review${existing ? `; ${existing} page(s) were already imported` : ""}. ${skipped.length} page(s) had no question.`;
}

// ---------------------------------------------------------------------------
// Settings, students, retention
// ---------------------------------------------------------------------------
export async function saveSettings(form: FormData, adminId: string) {
  const values: Record<string, unknown> = {
    ai_enabled: fbool(form, "ai_enabled"),
    ai_max_questions_per_session: Math.min(20, Math.max(0, fint(form, "ai_max_questions_per_session") ?? 6)),
    tts_rate: Math.min(1.3, Math.max(0.7, Number(fstr(form, "tts_rate")) || 0.95)),
    document_retention_days: Math.min(3650, Math.max(30, fint(form, "document_retention_days") ?? 365)),
  };
  for (const [key, value] of Object.entries(values)) {
    const { error } = await db().from("admin_settings").upsert({ key, value, updated_by: adminId, updated_at: new Date().toISOString() });
    if (error) fail("Could not save settings.");
  }
}

/** Deletes student documents older than the retention period (admins may delete, never read, files). */
export async function runRetention(): Promise<string> {
  const { data: s } = await db().from("admin_settings").select("value").eq("key", "document_retention_days").maybeSingle();
  const days = Number(s?.value ?? 365);
  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
  const { data: old } = await db().from("student_documents").select("id, storage_path").lt("created_at", cutoff).limit(1000);
  if (old?.length) {
    await db().storage.from("student-documents").remove(old.map((o) => o.storage_path));
    await db().from("student_documents").delete().in("id", old.map((o) => o.id));
  }
  return `Retention run complete: ${old?.length ?? 0} document(s) older than ${days} days deleted.`;
}

export async function setUserRole(id: string, role: "student" | "admin", adminId: string) {
  if (id === adminId && role !== "admin") fail("You cannot remove your own admin role.");
  const { error } = await db().from("users").update({ role }).eq("id", id);
  if (error) fail("Could not update the role.");
}

export async function deleteStudent(id: string, adminId: string) {
  if (id === adminId) fail("You cannot delete your own account here.");
  const { data: docs } = await db().from("student_documents").select("storage_path").eq("user_id", id);
  if (docs?.length) await db().storage.from("student-documents").remove(docs.map((d) => d.storage_path));
  const { error } = await db().rpc("admin_delete_user", { p_user: id });
  if (error) fail("Could not delete the student.");
}
