/**
 * Structured personalisation templates. Used when no AI-generated questions
 * exist for an interview. These are NOT AI: each question is filled from a
 * field that is actually present in the student's reviewed background, and
 * they are always labelled 'template'.
 */
import type { ResumeContext } from "./context.ts";

export interface TemplateQuestion {
  question: string;
  category: string;
  basis: string; // which background field the question is built from
}

const clean = (s: string) => s.replace(/\s+/g, " ").replace(/[.;,:]+$/, "").trim();

/** Best-effort subject of the previous degree, e.g. "BCom (Accounting)" -> "commerce (accounting)". */
export function subjectOf(ctx: ResumeContext, previousQualification: string | null): string | null {
  if (ctx.degree_subject) return clean(ctx.degree_subject);
  const src = previousQualification || ctx.qualifications[0]?.title || "";
  if (!src) return null;
  const abbrev: Array<[RegExp, string]> = [
    [/\bB\.?\s?Com\b/i, "commerce"], [/\bB\.?\s?B\.?\s?A\b/i, "business administration"], [/\bB\.?\s?Tech\b/i, "technology"],
    [/\bB\.?\s?C\.?\s?A\b/i, "computer applications"], [/\bB\.?\s?Sc\b/i, "science"], [/\bB\.?\s?A\b/, "arts"], [/\bB\.?\s?E\b/, "engineering"],
  ];
  const inMatch = src.match(/\b(?:in|of)\s+([A-Za-z &]+?)(?:,|\(|$)/);
  if (inMatch) return clean(inMatch[1]).toLowerCase();
  const paren = src.match(/\(([^)]+)\)/);
  const hit = abbrev.find(([re]) => re.test(src));
  if (hit) {
    // "BTech Computer Science" -> "computer science"; "BCom (Accounting)" -> "commerce (accounting)"
    const rest = clean(src.replace(hit[0], "").replace(/\([^)]*\)/g, "").replace(/,.*$/, "").replace(/^[\s.\-–]+/, ""));
    if (rest && /[a-z]{3,}/i.test(rest)) return rest.toLowerCase();
    return paren ? `${hit[1]} (${clean(paren[1]).toLowerCase()})` : hit[1];
  }
  return clean(src.replace(/,.*$/, ""));
}

const words = (s: string) => new Set(s.toLowerCase().match(/[a-z]{4,}/g) ?? []);

export function templateQuestions(ctx: ResumeContext, previousQualification: string | null, course: string, max: number): TemplateQuestion[] {
  const out: TemplateQuestion[] = [];
  const subject = subjectOf(ctx, previousQualification);
  if (subject) {
    out.push({ question: `How does your background in ${subject} prepare you for studying ${course}?`, category: "academic_background", basis: "degree subject" });
    const overlap = [...words(subject)].some((w) => words(course).has(w));
    if (!overlap) out.push({ question: `Why have you decided to move from ${subject} to ${course}?`, category: "why_course", basis: "degree subject" });
    out.push({ question: `Which skills or topics from your ${subject} studies do you expect to use most on the ${course} programme?`, category: "academic_background", basis: "degree subject" });
  }
  const role = ctx.experience[0];
  if (role?.role) {
    const at = role.organisation ? ` at ${clean(role.organisation)}` : "";
    out.push({ question: `How will your experience as ${clean(role.role)}${at} help you during your studies in ${course}?`, category: "employment_experience", basis: "work experience" });
  }
  if (ctx.projects[0]) out.push({ question: `You worked on "${clean(ctx.projects[0]).slice(0, 80)}". How does that project connect with what you will study in ${course}?`, category: "academic_background", basis: "project" });
  if (ctx.skills.length >= 2) out.push({ question: `Your CV mentions ${ctx.skills.slice(0, 2).join(" and ")}. How do you plan to build on these skills during ${course}?`, category: "academic_background", basis: "skills" });
  if (ctx.career_objective) out.push({ question: `You mention the goal "${clean(ctx.career_objective).slice(0, 90)}". How will ${course} help you achieve it?`, category: "career_goals", basis: "career goal" });
  if (ctx.education_gap) out.push({ question: `Your CV notes a gap in your education. What did you do during that time, and how did it lead you to ${course}?`, category: "academic_background", basis: "stated education gap" });
  return out.slice(0, max);
}
