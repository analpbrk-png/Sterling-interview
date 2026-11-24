/**
 * Pure checks applied to everything the local model produces:
 * - profile facts must be supported by words that are actually in the CV;
 * - "personalised" questions must refer to something in the student's background;
 * - course questions must refer to the selected course (or a verified module).
 */
import { sanitiseResumeContext, type ResumeContext } from "@/lib/ai/context";

const STOP = new Set(("the and for with from into your you are was were has have had this that these those about over under " +
  "will would could should can may might what which when where why how who whom also more most such than then them they " +
  "their there here our out not but all any each other into onto upon via per its it's ltd pvt inc company university college school " +
  "degree course programme program student studies study background experience skills skill project projects work working role").split(" "));

export function tokens(s: string | null | undefined): string[] {
  return (s ?? "").toLowerCase().normalize("NFKD").match(/[a-z0-9+#]{3,}/g)?.filter((t) => !STOP.has(t)) ?? [];
}

function supported(value: string | null | undefined, source: Set<string>, ratio = 0.6): boolean {
  const t = tokens(value);
  if (!t.length) return false;
  return t.filter((x) => source.has(x)).length / t.length >= ratio;
}

/** Drops anything the CV text does not support, so the model cannot invent qualifications or jobs. */
export function groundProfile(raw: unknown, cvText: string): ResumeContext {
  const ctx = sanitiseResumeContext(raw);
  const src = new Set(tokens(cvText));
  const gapWords = /\b(gap|break|sabbatical|career break)\b/i;
  return {
    qualifications: ctx.qualifications.filter((q) => supported(q.title, src)),
    experience: ctx.experience.filter((e) => supported(e.role, src)).map((e) => ({ ...e, organisation: supported(e.organisation, src) ? e.organisation : null, summary: supported(e.summary, src, 0.5) ? e.summary : null })),
    projects: ctx.projects.filter((p) => supported(p, src, 0.5)),
    skills: ctx.skills.filter((s) => supported(s, src, 1)),
    career_objective: supported(ctx.career_objective, src, 0.5) ? ctx.career_objective : null,
    degree_subject: supported(ctx.degree_subject, src, 0.5) ? ctx.degree_subject : null,
    academic_interests: (ctx.academic_interests ?? []).filter((p) => supported(p, src, 0.6)),
    education_gap: ctx.education_gap && gapWords.test(cvText) && supported(ctx.education_gap, src, 0.4) ? ctx.education_gap : null,
  };
}

/** Background terms that a personalised question may refer to (excluding words of the course name). */
export function backgroundTerms(ctx: ResumeContext, previousQualification: string | null, course: string): Set<string> {
  const courseWords = new Set(tokens(course));
  const parts = [
    previousQualification, ctx.degree_subject, ...ctx.qualifications.map((q) => q.title),
    ...ctx.experience.map((e) => `${e.role} ${e.organisation ?? ""}`), ...ctx.projects, ...ctx.skills,
    ...(ctx.academic_interests ?? []), ctx.career_objective,
  ];
  const out = new Set<string>();
  for (const p of parts) for (const t of tokens(p)) if (!courseWords.has(t)) out.add(t);
  // Common degree abbreviations map to the words a question would naturally use.
  const pq = `${previousQualification ?? ""} ${ctx.qualifications.map((q) => q.title).join(" ")}`;
  if (/\bB\.?\s?Com\b/i.test(pq)) ["commerce", "commercial"].forEach((w) => out.add(w));
  if (/\bB\.?\s?Tech\b|\bB\.?\s?E\b/i.test(pq)) ["engineering", "technology", "technical"].forEach((w) => out.add(w));
  if (/\bB\.?\s?B\.?\s?A\b/i.test(pq)) ["business", "administration"].forEach((w) => out.add(w));
  if (/\bB\.?\s?A\b/.test(pq)) out.add("arts");
  return out;
}

export function isPersonalised(question: string, terms: Set<string>): boolean {
  return tokens(question).some((t) => terms.has(t));
}

export function isCourseSpecific(question: string, course: string, university: string, modules: string[]): boolean {
  const q = new Set(tokens(question));
  const courseTokens = tokens(course).filter((t) => !["msc", "mba", "ma", "bsc", "pgdip", "mres", "llm"].includes(t));
  if (courseTokens.some((t) => q.has(t)) || /\bmba\b/i.test(question) && /\bmba\b/i.test(course)) return true;
  if (modules.some((m) => tokens(m).length && tokens(m).every((t) => q.has(t)))) return true;
  return tokens(university).filter((t) => t.length > 3).some((t) => q.has(t)) && /course|programme|module/i.test(question);
}

const COMMON = new Set(("i uk united kingdom britain british england english scotland wales london what why how which when where who can could would " +
  "do does did is are have has will tell describe explain name give please your you this the a an in on at of for to and or " +
  "masters master bachelor bachelors msc mba ma bsc ba bcom btech degree university course programme program module modules").split(" "));

/**
 * Rejects questions that introduce named subjects, tools or organisations that
 * are not in the student's background, the course/university names or the
 * verified facts (e.g. a question about "Tableau" when the CV never mentions it).
 */
export function introducesUnknownNames(question: string, allowedText: string): string | null {
  const allowed = new Set(tokens(allowedText));
  const sentences = question.split(/(?<=[.?!])\s+/);
  for (const sentence of sentences) {
    const words = sentence.match(/[A-Za-z][A-Za-z+#&'-]*/g) ?? [];
    for (let i = 1; i < words.length; i++) {
      const w = words[i];
      if (!/^[A-Z]/.test(w)) continue;
      const lw = w.toLowerCase().replace(/'s$/, "");
      if (COMMON.has(lw) || lw.length < 3) continue;
      if (!allowed.has(lw)) return w;
    }
  }
  return null;
}

/** Interviewer questions address the student ("you"); first-person wording means the model wrote from the wrong side. */
export function wrongPerspective(question: string): boolean {
  const unquoted = question.replace(/"[^"]*"|“[^”]*”/g, "");
  return /\b(my|me|mine|myself|I'm|I am|I have|I will)\b/.test(unquoted) || /(^|[\s,])I\s/.test(unquoted);
}

const GENERIC = new Set(("prepare prepared preparing previous qualification qualifications degree subject subjects study studying studies skill skills required " +
  "require background course programme program help helps help us experience particular specific think believe expect most useful").split(" "));

/** Similarity of what two questions are actually about, ignoring the course name and generic interview words. */
export function coreSimilarity(a: string, b: string, course: string): number {
  const drop = new Set([...tokens(course), ...GENERIC]);
  const core = (s: string) => new Set(tokens(s).map((t) => t.replace(/(ing|ed|es|s)$/, "")).filter((t) => !drop.has(t) && t.length > 2));
  const ta = core(a), tb = core(b);
  if (!ta.size || !tb.size) return 1;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / Math.min(ta.size, tb.size);
}
