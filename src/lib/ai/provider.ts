import "server-only";
import type { GenerationContext, ResumeContext } from "./context";
import type { CandidateQuestion } from "./validate";

/** Provider-independent AI surface. Add a provider by implementing this interface. */
export interface AIProvider {
  readonly name: string;
  generateQuestions(input: {
    context: GenerationContext;
    count: number;
    avoid: string[];
    examples: string[];
  }): Promise<CandidateQuestion[]>;
  extractResume(redactedText: string): Promise<ResumeContext>;
}

export class AIUnavailableError extends Error {
  constructor(message = "AI provider is not configured") {
    super(message);
    this.name = "AIUnavailableError";
  }
}

export const AI_TIMEOUT_MS = 25_000;

export async function getAIProvider(): Promise<AIProvider | null> {
  const provider = (process.env.AI_PROVIDER ?? "anthropic").toLowerCase();
  if (provider === "none") return null;
  if (provider === "anthropic") {
    if (!process.env.ANTHROPIC_API_KEY) return null;
    const { AnthropicProvider } = await import("./anthropic");
    return new AnthropicProvider();
  }
  return null;
}
