export type DocumentKind = "resume" | "passport" | "course_document";

export const MAX_BYTES: Record<DocumentKind, number> = {
  resume: 5 * 1024 * 1024,
  passport: 10 * 1024 * 1024,
  course_document: 10 * 1024 * 1024,
};

type Detected = { mime: string; ext: string };

const PDF: Detected = { mime: "application/pdf", ext: "pdf" };
const DOCX: Detected = { mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", ext: "docx" };
const JPEG: Detected = { mime: "image/jpeg", ext: "jpg" };
const PNG: Detected = { mime: "image/png", ext: "png" };

const ALLOWED: Record<DocumentKind, Detected[]> = {
  resume: [PDF, DOCX],
  passport: [PDF, JPEG, PNG],
  course_document: [PDF, DOCX],
};

/** Identifies the file from its first bytes; the browser-supplied type is not trusted. */
export function sniff(bytes: Uint8Array, fileName: string): Detected | null {
  const starts = (...sig: number[]) => sig.every((b, i) => bytes[i] === b);
  if (starts(0x25, 0x50, 0x44, 0x46, 0x2d)) return PDF; // %PDF-
  if (starts(0xff, 0xd8, 0xff)) return JPEG;
  if (starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return PNG;
  if (starts(0x50, 0x4b, 0x03, 0x04) && /\.docx$/i.test(fileName)) {
    // A DOCX is a zip whose entries include word/document.xml.
    const head = new TextDecoder("latin1").decode(bytes.subarray(0, Math.min(bytes.length, 64 * 1024)));
    if (head.includes("word/") || head.includes("[Content_Types].xml")) return DOCX;
  }
  return null;
}

export function validateUpload(kind: DocumentKind, fileName: string, bytes: Uint8Array):
  | { ok: true; mime: string; ext: string; safeName: string }
  | { ok: false; error: string } {
  if (!bytes.length) return { ok: false, error: "The file is empty." };
  if (bytes.length > MAX_BYTES[kind]) {
    return { ok: false, error: `The file is too large (max ${Math.round(MAX_BYTES[kind] / 1024 / 1024)} MB).` };
  }
  const detected = sniff(bytes, fileName);
  const allowed = ALLOWED[kind];
  if (!detected || !allowed.some((a) => a.mime === detected.mime)) {
    const names = allowed.map((a) => a.ext.toUpperCase()).join(", ");
    return { ok: false, error: `Unsupported file. Please upload ${names}.` };
  }
  const safeName = fileName.replace(/[^\w.\- ]+/g, "_").slice(-120) || `document.${detected.ext}`;
  return { ok: true, mime: detected.mime, ext: detected.ext, safeName };
}

export const KIND_LABEL: Record<DocumentKind, string> = {
  resume: "CV / résumé",
  passport: "Passport",
  course_document: "Course document",
};
