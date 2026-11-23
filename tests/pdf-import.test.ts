import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import curated from "../data/question-import/cas-shield.json";
import { parseInterviewPdf } from "@/lib/questions/pdf-parse";
import {
  detectCountryInconsistency,
  detectSensitivity,
  detectUniversityMention,
  groupSimilar,
  normaliseQuestion,
} from "@/lib/questions/analysis";

// The reference PDFs and their page text are kept out of the public repo.
// Regenerate locally with: node scripts/extract-fixture-text.mjs
const FIXTURE = "tests/fixtures/source-pdf-text.json";
const hasFixture = existsSync(FIXTURE);
const pages = (hasFixture ? JSON.parse(readFileSync(FIXTURE, "utf8")) : {}) as Record<string, string[]>;

describe.skipIf(!hasFixture)("PDF importer against the three reference PDFs", () => {
  for (const source of curated.sources) {
    it(`finds every question page in ${source.file}`, () => {
      const result = parseInterviewPdf(pages[source.file]);
      expect(result.items.map((i) => i.page)).toEqual(source.items.map((i) => i.page));
      // every page is accounted for: an item or an explained skip
      expect(result.items.length + result.skipped.length).toBe(source.pages);
      for (const item of source.items) {
        const parsed = result.items.find((p) => p.page === item.page)!;
        expect(parsed.type).toBe(("type" in item && item.type) || "question");
        // Source wording survives extraction (whitespace aside).
        const flat = (s: string) => normaliseQuestion(s.replace(/^QUESTION \d+\s*/i, ""));
        expect(flat(parsed.sourceText)).toContain(flat(item.source_text).slice(0, 60));
      }
    });
  }

  it("reads preparation and response timings from the mock deck", () => {
    const { items } = parseInterviewPdf(pages["CAS_SHIELD_MOCK.pdf"]);
    const q3 = items.find((i) => i.page === 6)!;
    expect(q3.prepSeconds).toBe(20);
    expect(q3.answerSeconds).toBe(60);
    const identity = items.find((i) => i.page === 3)!;
    expect(identity.prepSeconds).toBe(30);
    expect(identity.submissionMode).toBe("manual");
    expect(identity.pronunciationWords).toEqual(["Hocus-pocus", "Jibber-jabber", "Babbling"]);
  });

  it("extracts pronunciation words from deck 2", () => {
    const { items } = parseInterviewPdf(pages["CAS SHIELD INTERVIEW 2.pdf"]);
    expect(items.find((i) => i.page === 8)!.pronunciationWords).toEqual(["Baton", "Rabbit", "Babbling"]);
  });
});

describe("question analysis", () => {
  it("flags sensitive questions", () => {
    expect(detectSensitivity("Do you have any known health conditions that may affect your ability to study with us?").sensitive).toBe(true);
    expect(detectSensitivity("Will you be bringing dependants?").sensitive).toBe(true);
    expect(detectSensitivity("Have you ever received a visa refusal?").sensitive).toBe(true);
    expect(detectSensitivity("What can you tell me about the British weather?").sensitive).toBe(false);
  });

  it("detects named universities but not generic phrases", () => {
    expect(detectUniversityMention("choosing this course and the University of Chester over those alternatives?")).toBe("University of Chester");
    expect(detectUniversityMention("after completing your studies at our university?")).toBeNull();
  });

  it("flags US references in UK questions without changing them", () => {
    const text = "after your course and US visa have ended?";
    expect(detectCountryInconsistency(text, "UK")).toMatch(/US/);
    expect(detectCountryInconsistency("UK student visa", "UK")).toBeNull();
  });

  it("groups duplicates without dropping records", () => {
    const items = [
      { key: "a", text: "Have you ever received a visa refusal?" },
      { key: "b", text: "Have you ever received a visa refusal? If so, please explain why you have been refused." },
      { key: "c", text: "Have you ever received a visa refusal?" },
      { key: "d", text: "What can you tell me about the British weather?" },
    ];
    const g = groupSimilar(items);
    expect(g.size).toBe(4);
    expect(g.get("c")!.duplicateOf).toBe("a");
    expect(g.get("b")!.group).toBe(g.get("a")!.group);
    expect(g.get("d")!.group).not.toBe(g.get("a")!.group);
  });
});
