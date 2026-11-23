/**
 * Pure helpers used when importing, reviewing and selecting questions.
 * None of these change source wording; they only produce flags for admin review.
 */

const SENSITIVE_RULES: Array<{ reason: string; pattern: RegExp }> = [
  { reason: "Medical or health information", pattern: /health condition|medical|disabilit|illness/i },
  { reason: "Family dependants", pattern: /dependant/i },
  { reason: "Immigration history (visa refusals)", pattern: /visa refusal|been refused/i },
  { reason: "Personal circumstances that could prevent return or study", pattern: /prevent you from returning|interrupt or terminate your studies/i },
];

export function detectSensitivity(text: string): { sensitive: boolean; reason: string | null } {
  const hits = SENSITIVE_RULES.filter((r) => r.pattern.test(text)).map((r) => r.reason);
  return { sensitive: hits.length > 0, reason: hits.length ? hits.join("; ") : null };
}

/** Returns a specific university named in the text, e.g. "University of Chester". */
export function detectUniversityMention(text: string): string | null {
  const m =
    text.match(/\b(?:the\s+)?(University of [A-Z][A-Za-z&'-]+(?:\s+[A-Z][A-Za-z&'-]+)*)/) ??
    text.match(/\b([A-Z][A-Za-z&'-]+(?:\s+[A-Z][A-Za-z&'-]+)*\s+University)\b/);
  if (!m) return null;
  const name = m[1].trim();
  // Generic phrases such as "Our University" are not specific institutions.
  if (/^(our|this|the|your|a)\s/i.test(name)) return null;
  return name;
}

/** Flags wording that references a different study country than the question's country. */
export function detectCountryInconsistency(text: string, country: string): string | null {
  const others: Record<string, RegExp> = {
    US: /\b(US|U\.S\.|USA|American)\s+(visa|student visa|F-1)\b|\bF-1 visa\b/,
    Canada: /\bstudy permit\b|\bCanadian visa\b/,
    Australia: /\bsubclass 500\b|\bAustralian visa\b/,
  };
  for (const [name, pattern] of Object.entries(others)) {
    if (name !== country && pattern.test(text)) {
      return `Mentions ${name} although the question is filed under ${country}. Review the wording; the source document is left unchanged.`;
    }
  }
  return null;
}

/** Detects statements that conflict with this platform's no-recording / no-verification policy. */
export function detectPolicyConflicts(text: string): string[] {
  const notes: string[] = [];
  if (/record(ed|ing)/i.test(text)) {
    notes.push("Source mentions recording. This platform never records; show the practice wording instead.");
  }
  if (/vocal analysis|confirm your (id|identity)|confirm your ID/i.test(text)) {
    notes.push("Source claims identity/vocal verification. This platform does not verify identity; do not present this claim to students.");
  }
  return notes;
}

const STOP = new Set(
  "a an the and or of to in on for with your you are is be do does did have has what which how why that this these those at as it its by from about any can will would could please there their them they we our us me my i if so".split(
    " ",
  ),
);

export function normaliseQuestion(text: string): string {
  return text
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/[^a-z0-9' ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stem(word: string): string {
  return word.replace(/(ing|ed|es|s)$/, "");
}

export function contentTokens(text: string): Set<string> {
  return new Set(
    normaliseQuestion(text)
      .split(" ")
      .filter((w) => w.length > 2 && !STOP.has(w))
      .map(stem),
  );
}

/** Jaccard similarity on content tokens, 0..1. */
export function similarity(a: string, b: string): number {
  const ta = contentTokens(a);
  const tb = contentTokens(b);
  if (!ta.size || !tb.size) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / (ta.size + tb.size - inter);
}

export const DUPLICATE_THRESHOLD = 0.85;
export const SIMILAR_THRESHOLD = 0.45;

export interface Groupable {
  key: string;
  text: string;
}

/**
 * Assigns similarity groups with single-linkage clustering. Records are never
 * removed: duplicates point at the first record of their group.
 */
export function groupSimilar<T extends Groupable>(
  items: T[],
): Map<string, { group: string; duplicateOf: string | null; bestScore: number }> {
  const result = new Map<string, { group: string; duplicateOf: string | null; bestScore: number }>();
  const groups: Array<{ id: string; members: T[] }> = [];
  for (const item of items) {
    let best: { g: (typeof groups)[number]; score: number; member: T } | null = null;
    for (const g of groups) {
      for (const m of g.members) {
        const s = normaliseQuestion(m.text) === normaliseQuestion(item.text) ? 1 : similarity(m.text, item.text);
        if (!best || s > best.score) best = { g, score: s, member: m };
      }
    }
    if (best && best.score >= SIMILAR_THRESHOLD) {
      best.g.members.push(item);
      result.set(item.key, {
        group: best.g.id,
        duplicateOf: best.score >= DUPLICATE_THRESHOLD ? best.g.members[0].key : null,
        bestScore: best.score,
      });
    } else {
      const id = `g${groups.length + 1}`;
      groups.push({ id, members: [item] });
      result.set(item.key, { group: id, duplicateOf: null, bestScore: 1 });
    }
  }
  return result;
}
