/**
 * Practice scoring rubric (educational feedback, not an official evaluation).
 *
 * Content dimensions (relevance, content, clarity, completeness) are scored by the
 * free local language model from the question and the machine transcript, using the
 * anchored bands below, and each score must come with a reason. Delivery is NOT
 * judged by the model: it is calculated from measured audio timing only, and never
 * from accent, pitch or voice.
 *
 * Nothing is scored without evidence: if the transcript is missing or too short,
 * the answer is "not assessed".
 */
export const RUBRIC_VERSION = "practice-v1";
export const MIN_WORDS_FOR_SCORING = 8;

export type Dimension = "relevance" | "content" | "clarity" | "completeness" | "delivery";
export const DIMENSIONS: Array<{ key: Dimension; label: string; description: string }> = [
  { key: "relevance", label: "Relevance", description: "How directly the answer addresses the question that was asked." },
  { key: "content", label: "Content", description: "Specific, relevant information and explanation (reasons, examples, facts about the course or plans)." },
  { key: "clarity", label: "Clarity", description: "Whether the answer is understandable and logically organised. Grammar, accent and transcription errors are not penalised." },
  { key: "completeness", label: "Completeness", description: "Whether every part of the question is answered (e.g. all requested reasons)." },
  { key: "delivery", label: "Delivery", description: "Measured from audio only: how much of the answer time was used speaking, and speaking rate when a transcript exists." },
];
export const BANDS = [
  { min: 90, text: "Excellent: fully answers with specific, well-explained detail" },
  { min: 70, text: "Good: answers clearly with some specific detail; minor gaps" },
  { min: 50, text: "Adequate: partly answers; general or thin explanation" },
  { min: 30, text: "Weak: mostly off-topic, vague or very short" },
  { min: 0, text: "Not answered or unrelated" },
];
/** Weights for the overall practice score; re-normalised over assessed dimensions. */
export const WEIGHTS: Record<Dimension, number> = { relevance: 0.3, content: 0.25, clarity: 0.2, completeness: 0.15, delivery: 0.1 };

export const bandFor = (score: number) => BANDS.find((b) => score >= b.min)!.text;
export const clampScore = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.min(100, Math.round(v))) : null);

export interface SpeechMetrics {
  answerWindowMs: number;
  recordedMs: number | null;
  speechMs: number | null;
  speechIsEstimate: boolean;
  wordCount: number | null;
}

export const wordsPerMinute = (words: number | null, speechMs: number | null) =>
  words != null && speechMs != null && speechMs >= 3000 && words > 0 ? Math.round((words / speechMs) * 60_000) : null;

/** Piecewise-linear helper: 100 inside [lo, hi], falling to `floor` at the outer limits. */
function plateau(x: number, outerLo: number, lo: number, hi: number, outerHi: number, floor = 0) {
  if (x >= lo && x <= hi) return 100;
  if (x < lo) return x <= outerLo ? floor : floor + ((x - outerLo) / (lo - outerLo)) * (100 - floor);
  return x >= outerHi ? floor : floor + ((outerHi - x) / (outerHi - hi)) * (100 - floor);
}

/**
 * Delivery from measurements only.
 *  - Use of answer time: speaking for 50–95% of the answer window scores 100;
 *    falls to 0 at 10% (almost silent).
 *  - Speaking rate (only with a transcript and at least 10 s of speech): 100–170 words/min scores 100; falls
 *    to 40 at 60 or 230 words/min. International English speakers vary; the band is wide on purpose.
 */
export function deliveryScore(m: SpeechMetrics): { score: number | null; reason: string } {
  if (m.speechMs == null || m.recordedMs == null || m.recordedMs < 3000) return { score: null, reason: "Not assessed: no usable audio measurement." };
  const use = m.speechMs / m.answerWindowMs;
  const useScore = plateau(use, 0.1, 0.5, 0.95, 1.5);
  const wpm = wordsPerMinute(m.wordCount, m.speechMs);
  const parts = [`spoke for ${Math.round(use * 100)}% of the answer time`];
  let score = useScore;
  if (wpm != null && m.speechMs >= 10_000) {
    const rateScore = plateau(wpm, 60, 100, 170, 230, 40);
    score = 0.6 * useScore + 0.4 * rateScore;
    parts.push(`about ${wpm} words per minute`);
  }
  return { score: Math.round(score), reason: `Measured from audio: ${parts.join(", ")}${m.speechIsEstimate ? " (speech time is an estimate)" : ""}.` };
}

export function overallScore(scores: Partial<Record<Dimension, number | null>>): number | null {
  let sum = 0, w = 0;
  for (const d of Object.keys(WEIGHTS) as Dimension[]) {
    const s = scores[d];
    if (s != null) { sum += s * WEIGHTS[d]; w += WEIGHTS[d]; }
  }
  return w >= 0.5 ? Math.round(sum / w) : null;
}

/** Feedback must stay about the answer. Sentences that judge honesty, credibility, accent or outcomes are removed. */
const OFF_LIMITS = /\b(honest|dishonest|lying|liar|truthful|genuine(?:ness)?|credib|visa (?:approv|refus|grant|success)|will (?:be|get) (?:approved|accepted|refused|rejected)|admission chances?|accent|pitch|personality|nervous|confiden(?:t|ce))/i;
export function cleanList(v: unknown, max = 5): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x): x is string => typeof x === "string")
    .map((x) => x.replace(/\s+/g, " ").trim())
    .filter((x) => x.length >= 6 && x.length <= 400 && !OFF_LIMITS.test(x))
    .slice(0, max);
}

export interface ModelScores {
  relevance?: { score?: unknown; reason?: unknown };
  content?: { score?: unknown; reason?: unknown };
  clarity?: { score?: unknown; reason?: unknown };
  completeness?: { score?: unknown; reason?: unknown };
  strengths?: unknown; weaknesses?: unknown; suggestions?: unknown; outline?: unknown;
}

export interface AnswerAnalysis {
  status: "completed" | "insufficient_evidence";
  scores: Record<Dimension, number | null>;
  reasons: Record<Dimension, string>;
  overall: number | null;
  strengths: string[];
  weaknesses: string[];
  suggestions: string[];
  outline: string[];
}

/** Combines model output with measured delivery. A content score without a reason is discarded. */
export function buildAnalysis(model: ModelScores | null, metrics: SpeechMetrics): AnswerAnalysis {
  const delivery = deliveryScore(metrics);
  const scores = { relevance: null, content: null, clarity: null, completeness: null, delivery: delivery.score } as Record<Dimension, number | null>;
  const reasons = { relevance: "Not assessed", content: "Not assessed", clarity: "Not assessed", completeness: "Not assessed", delivery: delivery.reason } as Record<Dimension, string>;
  const enough = (metrics.wordCount ?? 0) >= MIN_WORDS_FOR_SCORING;
  if (model && enough) {
    for (const d of ["relevance", "content", "clarity", "completeness"] as const) {
      const s = clampScore(model[d]?.score);
      const r = typeof model[d]?.reason === "string" ? (model[d]!.reason as string).trim().slice(0, 400) : "";
      if (s != null && r.length >= 10 && !OFF_LIMITS.test(r)) { scores[d] = s; reasons[d] = r; }
    }
  } else if (!enough) {
    for (const d of ["relevance", "content", "clarity", "completeness"] as const) reasons[d] = `Not assessed: the transcript has fewer than ${MIN_WORDS_FOR_SCORING} words.`;
  }
  const contentAssessed = (["relevance", "content", "clarity", "completeness"] as const).some((d) => scores[d] != null);
  return {
    status: contentAssessed ? "completed" : "insufficient_evidence",
    scores,
    reasons,
    overall: contentAssessed ? overallScore(scores) : null,
    strengths: contentAssessed ? cleanList(model?.strengths) : [],
    weaknesses: contentAssessed ? cleanList(model?.weaknesses) : [],
    suggestions: contentAssessed ? cleanList(model?.suggestions) : [],
    outline: contentAssessed ? cleanList(model?.outline, 6) : [],
  };
}
