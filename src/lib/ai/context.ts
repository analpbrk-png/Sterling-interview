/**
 * Builds the minimum context sent to the AI provider for one application.
 * Contains no name, email, student ID, passport data or other applications.
 */

export interface ResumeContext {
  qualifications: Array<{ title: string; institution?: string | null; year?: string | null }>;
  experience: Array<{ role: string; organisation?: string | null; summary?: string | null }>;
  projects: string[];
  skills: string[];
  career_objective: string | null;
}

export const EMPTY_RESUME_CONTEXT: ResumeContext = {
  qualifications: [],
  experience: [],
  projects: [],
  skills: [],
  career_objective: null,
};

export interface GenerationContext {
  country: string;
  university: string;
  course: string;
  courseLevel: string | null;
  verifiedCourseFacts: {
    description: string | null;
    modules: string[];
    details: Array<{ kind: string; content: string }>;
  } | null;
  previousQualification: string | null;
  resume: ResumeContext | null;
}

export interface ContextInputs {
  profile: { previous_qualification: string | null; resume_context: unknown; resume_context_status: string };
  university: { name: string; country: string };
  course: { name: string; level: string | null; description: string | null; modules: string[]; is_verified: boolean };
  details: Array<{ kind: string; content: string; is_verified: boolean }>;
}

function clip(s: string | null | undefined, max: number): string | null {
  if (!s) return null;
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

export function buildGenerationContext(input: ContextInputs): GenerationContext {
  const verifiedDetails = input.details.filter((d) => d.is_verified).map((d) => ({ kind: d.kind, content: clip(d.content, 600)! }));
  const resume =
    input.profile.resume_context_status === "confirmed" ? sanitiseResumeContext(input.profile.resume_context) : null;
  return {
    country: input.university.country,
    university: input.university.name,
    course: input.course.name,
    courseLevel: input.course.level,
    // Unverified course data is never used as fact.
    verifiedCourseFacts: input.course.is_verified
      ? {
          description: clip(input.course.description, 800),
          modules: input.course.modules.slice(0, 20).map((m) => clip(m, 120)!),
          details: verifiedDetails.slice(0, 8),
        }
      : verifiedDetails.length
        ? { description: null, modules: [], details: verifiedDetails.slice(0, 8) }
        : null,
    previousQualification: clip(input.profile.previous_qualification, 200),
    resume,
  };
}

/** Coerces stored JSON into the ResumeContext shape and bounds every field. */
export function sanitiseResumeContext(raw: unknown): ResumeContext {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const arr = (v: unknown) => (Array.isArray(v) ? v : []);
  const str = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? clip(v, max) : null);
  return {
    qualifications: arr(r.qualifications)
      .slice(0, 6)
      .map((q) => q as Record<string, unknown>)
      .map((q) => ({ title: str(q.title, 160) ?? "", institution: str(q.institution, 160), year: str(q.year, 20) }))
      .filter((q) => q.title),
    experience: arr(r.experience)
      .slice(0, 6)
      .map((e) => e as Record<string, unknown>)
      .map((e) => ({ role: str(e.role, 120) ?? "", organisation: str(e.organisation, 120), summary: str(e.summary, 300) }))
      .filter((e) => e.role),
    projects: arr(r.projects).map((p) => str(p, 200)).filter((p): p is string => !!p).slice(0, 6),
    skills: arr(r.skills).map((s) => str(s, 60)).filter((s): s is string => !!s).slice(0, 20),
    career_objective: str(r.career_objective, 400),
  };
}

/** Removes contact details and long digit runs before any CV text leaves the server. */
export function redactPersonalData(text: string): string {
  return text
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .replace(/https?:\/\/\S+|www\.\S+/gi, "[link]")
    .replace(/\+?\d[\d\s().-]{7,}\d/g, "[number]")
    .replace(/\b(passport|aadhaar|ssn|national id)\s*(no\.?|number)?\s*[:#]?\s*[A-Z0-9-]{5,}/gi, "[id]");
}
