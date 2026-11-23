import "server-only";
import { extractText, getDocumentProxy } from "unpdf";

/** Extracts text page by page. Throws on encrypted or unreadable PDFs. */
export async function extractPdfPages(bytes: Uint8Array): Promise<string[]> {
  const pdf = await getDocumentProxy(bytes);
  if (pdf.numPages > 200) throw new Error("PDF has more than 200 pages");
  const { text } = await extractText(pdf, { mergePages: false });
  return text;
}
