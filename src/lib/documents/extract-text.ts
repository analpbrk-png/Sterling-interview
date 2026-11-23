import "server-only";
import { extractPdfPages } from "@/lib/questions/pdf-text";

/** Extracts plain text from a CV for context extraction. The text is not stored. */
export async function extractDocumentText(bytes: Uint8Array, mime: string): Promise<string> {
  if (mime === "application/pdf") {
    return (await extractPdfPages(bytes)).join("\n").slice(0, 40_000);
  }
  if (mime.includes("wordprocessingml")) {
    const mammoth = await import("mammoth");
    const { value } = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
    return value.slice(0, 40_000);
  }
  return "";
}
