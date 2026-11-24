import { describe, expect, it } from "vitest";
import { buildAnalysis, deliveryScore, overallScore, wordsPerMinute, cleanList } from "../src/lib/analysis/rubric";

const m = (o: Partial<Parameters<typeof deliveryScore>[0]> = {}) => ({ answerWindowMs: 60000, recordedMs: 59600, speechMs: 43200, speechIsEstimate: false, wordCount: 95, ...o });
const good = { relevance: { score: 85, reason: "Answers why they chose the course directly." }, content: { score: 75, reason: "Mentions BCom background as a reason." }, clarity: { score: 80, reason: "Ideas follow a clear order." }, completeness: { score: 70, reason: "Gives two of the three reasons asked for." }, strengths: ["Links BCom to analytics"], weaknesses: ["No specific module named"], suggestions: ["Name one module and why it matters"], outline: ["State your reason", "Give your background"] };

describe("practice rubric", () => {
  it("does not score content without enough transcript", () => {
    const a = buildAnalysis(good, m({ wordCount: 3 }));
    expect(a.status).toBe("insufficient_evidence");
    expect(a.scores.relevance).toBeNull();
    expect(a.overall).toBeNull();
    expect(a.reasons.content).toMatch(/Not assessed/);
  });

  it("keeps model scores only with a reason", () => {
    const a = buildAnalysis({ ...good, clarity: { score: 90, reason: "" } }, m());
    expect(a.scores.relevance).toBe(85);
    expect(a.scores.clarity).toBeNull();
  });

  it("delivery comes from measurements, not the model", () => {
    const d = deliveryScore(m());
    expect(d.score).toBeGreaterThan(80);
    expect(deliveryScore(m({ speechMs: 3000 })).score).toBeLessThan(10);
    expect(deliveryScore(m({ speechMs: null })).score).toBeNull();
  });

  it("words per minute needs a transcript and speech", () => {
    expect(wordsPerMinute(95, 43200)).toBe(132);
    expect(wordsPerMinute(null, 43200)).toBeNull();
  });

  it("overall is a weighted mean of assessed dimensions only", () => {
    expect(overallScore({ relevance: 80, content: 60 })).toBe(Math.round((80 * 0.3 + 60 * 0.25) / 0.55));
    expect(overallScore({ delivery: 90 })).toBeNull();
  });

  it("removes judgements about honesty, accent or visa outcome", () => {
    expect(cleanList(["Sounds honest and genuine", "Your accent is strong", "You will be approved", "Add a specific module example"])).toEqual(["Add a specific module example"]);
  });
});
