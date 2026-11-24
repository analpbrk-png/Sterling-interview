"use client";
import { chatJson } from "./engine";
import { backgroundTerms, coreSimilarity, groundProfile, introducesUnknownNames, isCourseSpecific, isPersonalised, wrongPerspective } from "./checks";
import { redactPersonalData, type ResumeContext } from "@/lib/ai/context";
import { validateGenerated } from "@/lib/ai/validate";
import { SYSTEM_CATEGORIES } from "@/lib/questions/categories";

const PROFILE_SCHEMA = {
  type: "object",
  properties: {
    degree_subject: { type: ["string", "null"] },
    qualifications: { type: "array", items: { type: "object", properties: { title: { type: "string" }, institution: { type: ["string", "null"] }, year: { type: ["string", "null"] } }, required: ["title", "institution", "year"] } },
    academic_interests: { type: "array", items: { type: "string" } },
    projects: { type: "array", items: { type: "string" } },
    experience: { type: "array", items: { type: "object", properties: { role: { type: "string" }, organisation: { type: ["string", "null"] }, summary: { type: ["string", "null"] } }, required: ["role", "organisation", "summary"] } },
    skills: { type: "array", items: { type: "string" } },
    education_gap: { type: ["string", "null"] },
    career_objective: { type: ["string", "null"] },
  },
  required: ["degree_subject", "qualifications", "academic_interests", "projects", "experience", "skills", "education_gap", "career_objective"],
};

const EXTRACT_SYSTEM = `You read a CV and copy out facts for an admissions interview practice tool.
Rules:
- Use ONLY information written in the CV. Never guess or add anything.
- degree_subject: the subject of the most recent degree (for example "Commerce" or "Computer Science"), or null.
- education_gap: only if the CV explicitly states a gap or career break; otherwise null.
- Leave out names, contact details, dates of birth, nationality, religion, health, marital status, photos and identity numbers.
- Keep each item short. Use empty lists or null when something is not in the CV.`;

/** Extracts a structured academic/professional profile from CV text, on this device. */
export async function extractProfileLocally(cvText: string): Promise<ResumeContext> {
  const text = redactPersonalData(cvText).replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").slice(0, 6000);
  const raw = await chatJson<unknown>(EXTRACT_SYSTEM, `<cv>\n${text}\n</cv>`, PROFILE_SCHEMA, { temperature: 0, maxTokens: 700 });
  // Anything not supported by the CV's own words is dropped.
  return groundProfile(raw, text);
}

const CATS = SYSTEM_CATEGORIES.filter((c) => c.id !== "identity").map((c) => c.id);
const QUESTIONS_SCHEMA = {
  type: "object",
  properties: {
    questions: {
      type: "array",
      items: {
        type: "object",
        properties: { question: { type: "string" }, category: { type: "string", enum: CATS }, based_on: { type: "string" } },
        required: ["question", "category", "based_on"],
      },
    },
  },
  required: ["questions"],
};

const GEN_SYSTEM = `You are an experienced UK university admissions interviewer running a practice credibility (CAS) interview.
Write clear, polite questions in British English, addressed to the student as "you". Each is one or two short sentences and ends with a question mark.
Rules:
- Use only the facts given. Never invent qualifications, jobs, module names, facilities, fees, rankings, visa rules or assessment methods.
- Do not add subjects, skills, software, tools or companies that are not listed in the student background or course facts.
- Mention no university other than the one given.
- Do not ask about health, family, religion, nationality or immigration history.
- Do not repeat or closely paraphrase the questions listed under "avoid".`;

export interface GeneratedQuestion {
  question: string;
  category: string;
  basedOn: string;
  kind: "personal" | "course";
}

export interface GenerationInput {
  kind: "personal" | "course";
  count: number;
  profile: ResumeContext;
  previousQualification: string | null;
  university: string;
  country: string;
  course: string;
  verifiedModules: string[];
  verifiedFacts: string[];
  avoid: string[];
  /** This student's other questions: replacements must be about something different. */
  siblings?: string[];
}

/** Generates and checks questions until `count` pass (max 3 model calls). */
export async function generateLocally(input: GenerationInput): Promise<{ accepted: GeneratedQuestion[]; rejected: number }> {
  const terms = backgroundTerms(input.profile, input.previousQualification, input.course);
  if (input.kind === "personal" && terms.size === 0) throw new Error("There is no background to personalise from. Add the student's CV or previous qualification first.");
  const background = {
    previous_qualification: input.previousQualification,
    degree_subject: input.profile.degree_subject,
    qualifications: input.profile.qualifications.map((q) => q.title),
    experience: input.profile.experience.map((e) => [e.role, e.organisation].filter(Boolean).join(", ")),
    projects: input.profile.projects,
    skills: input.profile.skills.slice(0, 10),
    academic_interests: input.profile.academic_interests,
    career_goal: input.profile.career_objective,
    stated_education_gap: input.profile.education_gap,
  };
  const task = input.kind === "personal"
    ? `Write ${input.count + 2} questions that connect THIS student's own background (their degree subject, projects, skills, experience or career goal) to the course. Every question must mention something specific from the background. Good example for a commerce graduate applying to Business Analytics: "How does your background in commerce prepare you for studying Business Analytics?"`
    : `Write ${input.count + 2} questions about the student's choice of this course and university: the course content, how it fits their plans, and what they know about it. Mention the course by name. Only refer to modules or facts listed under verified_course_facts; if none are listed, ask the student what they know instead of naming specifics.`;
  const ctx = { country: input.country, university: input.university, course: input.course, verified_course_facts: { modules: input.verifiedModules, facts: input.verifiedFacts } };

  const accepted: GeneratedQuestion[] = [];
  let rejected = 0;
  for (let attempt = 0; attempt < 3 && accepted.length < input.count; attempt++) {
    const user = [
      task,
      "", `<interview>${JSON.stringify(ctx)}</interview>`,
      input.kind === "personal" ? `<student_background>${JSON.stringify(background)}</student_background>` : `<student_background>${JSON.stringify({ previous_qualification: background.previous_qualification, career_goal: background.career_goal })}</student_background>`,
      "", "<avoid>", ...[...input.avoid, ...accepted.map((a) => a.question)].slice(0, 30).map((a) => `- ${a}`), "</avoid>",
    ].join("\n");
    const out = await chatJson<{ questions: Array<{ question: string; category: string; based_on: string }> }>(GEN_SYSTEM, user, QUESTIONS_SCHEMA, { temperature: 0.8, maxTokens: 900 });
    const candidates = (out.questions ?? []).map((q) => ({ question: q.question, category: q.category, rationale: q.based_on }));
    const genCtx = {
      country: input.country, university: input.university, course: input.course, courseLevel: null,
      verifiedCourseFacts: { description: null, modules: input.verifiedModules, details: [] }, previousQualification: input.previousQualification, resume: input.profile,
    };
    const { accepted: valid, rejected: bad } = validateGenerated(candidates, genCtx, [...input.avoid, ...accepted.map((a) => a.question)]);
    rejected += bad.length;
    const allowedText = [
      input.university, input.course, input.country, input.previousQualification, ...input.verifiedModules, ...input.verifiedFacts,
      JSON.stringify(input.profile),
    ].join(" ");
    for (const v of valid) {
      if (introducesUnknownNames(v.question, allowedText) || wrongPerspective(v.question)) { rejected++; continue; }
      // Stricter duplicate check within this student's own set.
      if ([...accepted.map((a) => a.question), ...(input.siblings ?? [])].some((a) => coreSimilarity(a, v.question, input.course) >= 0.6)) { rejected++; continue; }
      const ok = input.kind === "personal"
        ? isPersonalised(v.question, terms)
        : isCourseSpecific(v.question, input.course, input.university, input.verifiedModules);
      if (!ok) { rejected++; continue; }
      if (accepted.length < input.count) accepted.push({ question: v.question, category: v.category, basedOn: v.rationale ?? "", kind: input.kind });
    }
  }
  return { accepted, rejected };
}

const MODULES_SCHEMA = { type: "object", properties: { modules: { type: "array", items: { type: "string" } } }, required: ["modules"] };

/** Lists module names written in a course document. Only names found verbatim in the text are kept. */
export async function suggestModulesLocally(docText: string): Promise<string[]> {
  const text = docText.replace(/[ \t]+/g, " ").slice(0, 7000);
  const out = await chatJson<{ modules: string[] }>(
    "You copy module (unit) names from a university course document. Only copy names exactly as written. Do not invent any. Return at most 20.",
    `<document>\n${text}\n</document>`, MODULES_SCHEMA, { temperature: 0, maxTokens: 500 },
  );
  const lower = text.toLowerCase();
  return [...new Set((out.modules ?? []).map((m) => m.trim()).filter((m) => m.length >= 3 && m.length <= 120 && lower.includes(m.toLowerCase())))];
}
