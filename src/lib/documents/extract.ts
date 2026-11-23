"use client";

/** Reads text from a CV in the browser. The text itself is never stored. */
export async function extractTextInBrowser(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  try {
    if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) {
      const { extractText, getDocumentProxy } = await import("unpdf");
      const pdf = await getDocumentProxy(bytes.slice());
      const { text } = await extractText(pdf, { mergePages: true });
      return String(text).slice(0, 40_000);
    }
    if (/\.docx$/i.test(file.name)) {
      const mammoth = await import("mammoth");
      const { value } = await mammoth.extractRawText({ arrayBuffer: bytes.slice().buffer });
      return value.slice(0, 40_000);
    }
  } catch {
    // Fall through: unreadable files are still stored; the student can type details.
  }
  return "";
}
