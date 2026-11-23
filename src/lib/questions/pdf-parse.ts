import { suggestCategory } from "./categories";

export type ParsedType = "question" | "identity_instruction" | "pronunciation" | "declaration";

export interface ParsedItem {
  page: number;
  type: ParsedType;
  sourceText: string;
  questionText: string;
  category: string;
  prepSeconds: number | null;
  answerSeconds: number | null;
  submissionMode: "manual" | "automatic" | null;
  pronunciationWords: string[];
}

export interface SkippedPage {
  page: number;
  reason: string;
}

export interface ParseResult {
  items: ParsedItem[];
  skipped: SkippedPage[];
}

const HEADER = /^[A-Z][A-Z \-]{3,}INTERVIEW\s+\d{1,3}\s*\/\s*\d{1,3}$/;
const QUESTION_LABEL = /^QUESTION\s+\d+$/i;
const HELPER_LINES = [
  /^take a moment to organise your thoughts before answering\.?$/i,
  /^follow each instruction carefully\.?$/i,
  /^speak clearly and support your answer/i,
];

function cleanLines(raw: string): string[] {
  return raw
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter((l) => l && !HEADER.test(l) && !QUESTION_LABEL.test(l));
}

function joinSentence(lines: string[]): string {
  return lines.join(" ").replace(/\s+([?.,;:])/g, "$1").replace(/\s+/g, " ").trim();
}

function extractWords(text: string): string[] {
  const m = text.match(/(?:words?[^:;]*[:;]|out loud[:;])\s*([A-Za-z\- ,]+?)(?:\.|$|\s+This\b)/i);
  if (!m) return [];
  return m[1]
    .split(",")
    .map((w) => w.trim())
    .filter((w) => /^[A-Za-z][A-Za-z\-]{1,30}$/.test(w))
    .slice(0, 6);
}

/**
 * Turns per-page PDF text into reviewable question records. Wording is kept in
 * sourceText exactly as extracted (line breaks preserved); questionText is a
 * whitespace-normalised version for admins to edit.
 */
export function parseInterviewPdf(pages: string[]): ParseResult {
  const items: ParsedItem[] = [];
  const skipped: SkippedPage[] = [];
  let pendingPrep: number | null = null;

  pages.forEach((raw, idx) => {
    const page = idx + 1;
    const lines = cleanLines(raw);
    const text = joinSentence(lines);
    if (!text) {
      skipped.push({ page, reason: "Empty page" });
      return;
    }

    const prep = text.match(/PREPARATION TIME.*?(\d{1,3})\s*seconds/i);
    if (prep) {
      pendingPrep = Number(prep[1]);
      skipped.push({ page, reason: `Preparation time notice: ${prep[1]} seconds` });
      return;
    }
    const resp = text.match(/RESPONSE TIME\s*(\d{1,2})\s*min/i);
    if (resp) {
      const last = items[items.length - 1];
      if (last && last.answerSeconds == null) last.answerSeconds = Number(resp[1]) * 60;
      skipped.push({ page, reason: `Response time ${resp[1]} min` });
      return;
    }
    if (/^(✓\s*)?THANK YOU\b/i.test(text)) {
      skipped.push({ page, reason: "End of interview slide" });
      return;
    }

    const content = lines.filter((l) => !HELPER_LINES.some((h) => h.test(l)));
    const body = joinSentence(content);
    const sourceText = raw
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !HEADER.test(l))
      .join("\n");

    let type: ParsedType | null = null;
    if (/passport/i.test(body)) type = "identity_instruction";
    else if (/\bI confirm that\b/i.test(body)) type = "declaration";
    else if (/read the following (three )?words|words (clearly and )?out loud/i.test(body)) type = "pronunciation";
    else if (/\?/.test(body) || /^(what|why|how|when|which|who|where|can|could|do|does|did|are|is|have|has|will|would|name|describe|explain|tell)\b/i.test(body)) type = "question";

    if (!type) {
      skipped.push({ page, reason: body.split(" ").length <= 8 ? "Title slide" : "No question detected" });
      return;
    }

    let questionText = body
      .replace(/^Identity verification\s*/i, "")
      .replace(/^Read the statement aloud\s*/i, type === "declaration" ? "Read the statement aloud: " : "")
      .replace(/\.{3,}$/, ".")
      .trim();
    if (type === "question") questionText = questionText.replace(/\s*\.\.\.$/, "");

    const isIdentity = type !== "question";
    items.push({
      page,
      type,
      sourceText,
      questionText,
      category: isIdentity ? "identity" : suggestCategory(questionText),
      prepSeconds: pendingPrep,
      answerSeconds: null,
      submissionMode: /click stop recording|click .*next/i.test(body) ? "manual" : null,
      pronunciationWords: type === "question" || type === "declaration" ? [] : extractWords(body),
    });
  });

  return { items, skipped };
}
