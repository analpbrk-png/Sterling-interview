import "server-only";
import { getAIProvider } from "@/lib/ai/provider";
import { redactPersonalData, type ResumeContext } from "@/lib/ai/context";
import { basicResumeExtract } from "@/lib/ai/resume-basic";
import { extractDocumentText } from "./extract-text";

/**
 * Reads a CV and returns a short draft context for the student to review.
 * Only redacted text is sent to the AI provider; the raw text is discarded.
 */
export async function buildResumeDraft(bytes: Uint8Array, mime: string): Promise<{
  context: ResumeContext | null;
  mode: "ai" | "basic" | null;
  message: string;
}> {
  let text = "";
  try {
    text = await extractDocumentText(bytes, mime);
  } catch {
    return { context: null, mode: null, message: "We could not read text from this file. You can still enter your details manually." };
  }
  if (text.replace(/\s/g, "").length < 40) {
    return { context: null, mode: null, message: "This CV looks like a scanned image, so no text could be read. Please enter your details manually." };
  }
  const provider = await getAIProvider();
  if (provider) {
    try {
      const context = await provider.extractResume(redactPersonalData(text).slice(0, 20_000));
      return { context, mode: "ai", message: "We extracted your background with AI. Please review and correct it before confirming." };
    } catch (err) {
      console.error("[ai] resume extraction failed", err instanceof Error ? err.message : err);
    }
  }
  return {
    context: basicResumeExtract(text),
    mode: "basic",
    message: provider
      ? "AI extraction was unavailable, so we used basic section detection. Please review it carefully."
      : "AI is not configured, so we used basic section detection. Please review it carefully.",
  };
}
