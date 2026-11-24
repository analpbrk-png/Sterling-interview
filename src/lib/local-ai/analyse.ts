"use client";
/**
 * Practice feedback on one spoken answer, using the existing free local model
 * (WebLLM, same engine as question generation). Input is the real question, the
 * real transcript and verified course/background facts. Output is checked and
 * combined with measured delivery in lib/analysis/rubric.ts.
 */
import { chatJson, MODEL_LABEL } from "./engine";
import { BANDS, buildAnalysis, type AnswerAnalysis, type ModelScores, type SpeechMetrics } from "@/lib/analysis/rubric";

const dim = { type: "object", properties: { score: { type: "integer" }, reason: { type: "string" } }, required: ["score", "reason"] };
const SCHEMA = {
  type: "object",
  properties: {
    relevance: dim, content: dim, clarity: dim, completeness: dim,
    strengths: { type: "array", items: { type: "string" } },
    weaknesses: { type: "array", items: { type: "string" } },
    suggestions: { type: "array", items: { type: "string" } },
    outline: { type: "array", items: { type: "string" } },
  },
  required: ["relevance", "content", "clarity", "completeness", "strengths", "weaknesses", "suggestions", "outline"],
};

const SYSTEM = `You give practice feedback to a student preparing for a UK university credibility interview.
You receive the interview question, a machine transcript of the student's spoken answer, and verified facts.
Score each dimension from 0 to 100 using these bands:
${BANDS.map((b) => `- ${b.min}+: ${b.text}`).join("\n")}
Dimensions:
- relevance: how directly the answer addresses the question.
- content: specific, relevant information and explanation.
- clarity: understandable and logically organised. Do NOT penalise grammar, accent, filler words or transcription mistakes.
- completeness: whether every part of the question is answered.
For each score give a one-sentence reason that quotes or refers to what the student actually said.
Rules:
- Judge only what is in the transcript. Never assume things the student did not say.
- Never invent experiences, grades, employers or facts about the student.
- Never comment on honesty, credibility, personality, confidence, accent or visa/admission outcomes.
- strengths: up to 3 specific things the answer did well (empty if none).
- weaknesses: up to 3 things missing or unclear.
- suggestions: up to 3 practical tips for content and speaking.
- outline: 3-5 short steps for a stronger answer structure, using only the verified facts given (write "your ..." placeholders instead of inventing details).
Write in plain English, addressed to the adviser.`;

export interface AnalysisContext {
  question: string;
  transcript: string;
  university: string;
  course: string;
  verifiedModules: string[];
  background: string[]; // reviewed CV facts, e.g. "BCom (Accounting)"
}

export async function analyseAnswerLocally(ctx: AnalysisContext, metrics: SpeechMetrics): Promise<AnswerAnalysis & { model: string }> {
  const facts = [
    `University: ${ctx.university}`,
    `Course: ${ctx.course}`,
    ctx.verifiedModules.length ? `Verified course modules: ${ctx.verifiedModules.slice(0, 12).join("; ")}` : "Verified course modules: none provided",
    ctx.background.length ? `Student background (from reviewed CV): ${ctx.background.slice(0, 10).join("; ")}` : "Student background: not provided",
  ].join("\n");
  const user = `<question>\n${ctx.question}\n</question>\n<transcript>\n${ctx.transcript.slice(0, 4000)}\n</transcript>\n<verified_facts>\n${facts}\n</verified_facts>`;
  const raw = await chatJson<ModelScores>(SYSTEM, user, SCHEMA, { temperature: 0, maxTokens: 900 });
  return { ...buildAnalysis(raw, metrics), model: MODEL_LABEL };
}
