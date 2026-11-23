import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { SYSTEM_CATEGORIES } from "@/lib/questions/categories";
import { sanitiseResumeContext, type GenerationContext, type ResumeContext } from "./context";
import { AI_TIMEOUT_MS, type AIProvider } from "./provider";
import type { CandidateQuestion } from "./validate";

const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5-5";

const QuestionsSchema = z.object({
  questions: z.array(
    z.object({
      question: z.string(),
      category: z.string(),
      rationale: z.string(),
    }),
  ),
});

const ResumeSchema = z.object({
  qualifications: z.array(z.object({ title: z.string(), institution: z.string().nullable(), year: z.string().nullable() })),
  experience: z.array(z.object({ role: z.string(), organisation: z.string().nullable(), summary: z.string().nullable() })),
  projects: z.array(z.string()),
  skills: z.array(z.string()),
  career_objective: z.string().nullable(),
});

const QUESTION_SYSTEM = `You write practice questions for international students preparing for UK university credibility interviews (CAS Shield-style pre-CAS interviews).

Rules:
- Write natural, polite interview questions in clear British English, one sentence or two short sentences, ending with a question mark.
- Personalise using the student's background and the selected course, e.g. link their previous studies or experience to the course.
- Use ONLY facts present in the provided context. Never invent module names, facilities, campus details, tuition fees, living costs, visa or work-hour rules, rankings, or assessment methods. If verified course facts are absent, ask general questions that let the student show their own research (e.g. "Which modules...") instead of naming specifics.
- Mention only the selected university, never any other institution by name.
- Do not ask about health, family dependants, immigration history, religion, or other sensitive personal matters.
- Do not repeat or closely paraphrase the questions listed under "avoid".
- Categories must be one of: ${SYSTEM_CATEGORIES.filter((c) => c.id !== "identity").map((c) => c.id).join(", ")}.
- Give a one-line rationale (for the admin reviewer, never shown to the student).`;

const RESUME_SYSTEM = `Extract only the educational and career context needed to personalise university interview practice questions from the CV text.
Return qualifications, work or internship experience, notable projects, skills, and the career objective if stated.
Do not include names, contact details, dates of birth, nationality, identity numbers, addresses, references, or any other personal data. Keep each field short. If something is not present, return an empty list or null.`;

export class AnthropicProvider implements AIProvider {
  readonly name = "anthropic";
  private client = new Anthropic({ timeout: AI_TIMEOUT_MS, maxRetries: 1 });

  async generateQuestions(input: {
    context: GenerationContext;
    count: number;
    avoid: string[];
    examples: string[];
  }): Promise<CandidateQuestion[]> {
    const userPrompt = [
      `Write ${input.count + 2} candidate questions (the best ${input.count} will be used).`,
      "",
      "<context>",
      JSON.stringify(input.context, null, 2),
      "</context>",
      "",
      "<style_examples>",
      ...input.examples.slice(0, 8).map((e) => `- ${e}`),
      "</style_examples>",
      "",
      "<avoid>",
      ...input.avoid.slice(0, 40).map((e) => `- ${e}`),
      "</avoid>",
    ].join("\n");

    const response = await this.client.beta.messages.parse({
      model: MODEL,
      max_tokens: 4000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: betaZodOutputFormat(QuestionsSchema) },
      system: QUESTION_SYSTEM,
      messages: [{ role: "user", content: userPrompt }],
    });
    if (response.stop_reason === "refusal" || !response.parsed_output) return [];
    return response.parsed_output.questions;
  }

  async extractResume(redactedText: string): Promise<ResumeContext> {
    const response = await this.client.beta.messages.parse({
      model: MODEL,
      max_tokens: 3000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: betaZodOutputFormat(ResumeSchema) },
      system: RESUME_SYSTEM,
      messages: [{ role: "user", content: `<cv_text>\n${redactedText}\n</cv_text>` }],
    });
    if (response.stop_reason === "refusal" || !response.parsed_output) {
      throw new Error("The AI provider could not read this CV.");
    }
    return sanitiseResumeContext(response.parsed_output);
  }
}
