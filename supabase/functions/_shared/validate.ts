import { detectUniversityMention, similarity } from "./analysis.ts";
import { SYSTEM_CATEGORIES } from "./categories.ts";
import type { GenerationContext } from "./context.ts";

export interface CandidateQuestion {
  question: string;
  category: string;
  rationale?: string;
}

export interface ValidationResult {
  accepted: CandidateQuestion[];
  rejected: Array<{ question: string; reason: string }>;
}

const CATEGORY_IDS = new Set<string>(SYSTEM_CATEGORIES.map((c) => c.id));

/**
 * Rejects generated questions that are malformed, repetitive, or that assert
 * facts we did not supply (other universities, fees, modules, visa rules).
 */
export function validateGenerated(
  candidates: CandidateQuestion[],
  ctx: GenerationContext,
  existingTexts: string[],
): ValidationResult {
  const accepted: CandidateQuestion[] = [];
  const rejected: ValidationResult["rejected"] = [];
  const knownModules = (ctx.verifiedCourseFacts?.modules ?? []).map((m) => m.toLowerCase());

  for (const raw of candidates) {
    const question = raw.question.replace(/\s+/g, " ").trim();
    const reject = (reason: string) => rejected.push({ question, reason });

    if (question.length < 20 || question.length > 300) { reject("length"); continue; }
    if (!question.endsWith("?")) { reject("not a question"); continue; }
    if (!CATEGORY_IDS.has(raw.category) || raw.category === "identity") { reject("invalid category"); continue; }

    const uni = detectUniversityMention(question);
    if (uni && uni.toLowerCase() !== ctx.university.toLowerCase()) { reject(`mentions another university (${uni})`); continue; }

    if (/[£$€₹]\s?\d|\b\d[\d,]*\s?(pounds|gbp|usd|dollars)\b/i.test(question)) { reject("states a monetary figure"); continue; }
    if (/\b\d+\s?(hours?|hrs)\s+(per|a)\s+week\b/i.test(question)) { reject("states a visa/work rule"); continue; }

    // Any quoted or "module X" names must be verified modules.
    const quoted = [...question.matchAll(/[“"']([^“”"']{3,80})[”"']/g)].map((m) => m[1].toLowerCase());
    if (quoted.some((qn) => !knownModules.some((km) => km.includes(qn) || qn.includes(km)))) {
      reject("names unverified course content");
      continue;
    }
    if (!knownModules.length && /\bmodule[s]?\s+(called|named|titled|such as)\b/i.test(question)) {
      reject("names modules without verified data");
      continue;
    }

    const all = [...existingTexts, ...accepted.map((a) => a.question)];
    if (all.some((t) => similarity(t, question) >= 0.6)) { reject("too similar to another question"); continue; }

    accepted.push({ ...raw, question });
  }
  return { accepted, rejected };
}
