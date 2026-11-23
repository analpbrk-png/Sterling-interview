import { EMPTY_RESUME_CONTEXT, type ResumeContext } from "./context.ts";

/**
 * Heuristic CV reader used when no AI provider is configured. It finds common
 * section headings and keeps short lines; the student reviews the result.
 */
const SECTION_PATTERNS: Array<[keyof ResumeContext, RegExp]> = [
  ["qualifications", /^(education|academic (background|qualifications?)|qualifications?)\b/i],
  ["experience", /^(work experience|experience|employment|professional experience|internships?)\b/i],
  ["projects", /^(projects?|academic projects?)\b/i],
  ["skills", /^(skills|technical skills|key skills|core competencies)\b/i],
  ["career_objective", /^(career objective|objective|profile|summary|professional summary)\b/i],
];

export function basicResumeExtract(text: string): ResumeContext {
  const out: ResumeContext = structuredClone(EMPTY_RESUME_CONTEXT);
  let current: keyof ResumeContext | null = null;
  const objective: string[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/^[\s•\-–*·]+/, "").replace(/\s+/g, " ").trim();
    if (!line) continue;
    const heading = SECTION_PATTERNS.find(([, re]) => re.test(line) && line.length < 40);
    if (heading) {
      current = heading[0];
      continue;
    }
    if (!current || line.length > 220) continue;
    switch (current) {
      case "qualifications":
        if (out.qualifications.length < 6) {
          const year = line.match(/\b(19|20)\d{2}\b/)?.[0] ?? null;
          out.qualifications.push({ title: line.slice(0, 160), institution: null, year });
        }
        break;
      case "experience":
        if (out.experience.length < 6) out.experience.push({ role: line.slice(0, 120), organisation: null, summary: null });
        break;
      case "projects":
        if (out.projects.length < 6) out.projects.push(line.slice(0, 200));
        break;
      case "skills":
        for (const s of line.split(/[,;|]/).map((x) => x.trim()).filter(Boolean)) {
          if (out.skills.length < 20 && s.length <= 60) out.skills.push(s);
        }
        break;
      case "career_objective":
        if (objective.join(" ").length < 400) objective.push(line);
        break;
    }
  }
  out.career_objective = objective.length ? objective.join(" ").slice(0, 400) : null;
  return out;
}
