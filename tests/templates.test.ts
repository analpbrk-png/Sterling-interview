import { describe, expect, it } from "vitest";
import { subjectOf, templateQuestions } from "../supabase/functions/_shared/template-questions.ts";
import { EMPTY_RESUME_CONTEXT } from "@/lib/ai/context";

describe("template personalisation (not AI)", () => {
  it("builds questions only from fields that exist", () => {
    const qs = templateQuestions({ ...EMPTY_RESUME_CONTEXT }, "BCom (Accounting)", "MSc Business Analytics", 5);
    expect(qs.map((q) => q.question)).toEqual([
      "How does your background in commerce (accounting) prepare you for studying MSc Business Analytics?",
      "Why have you decided to move from commerce (accounting) to MSc Business Analytics?",
      "Which skills or topics from your commerce (accounting) studies do you expect to use most on the MSc Business Analytics programme?",
    ]);
    expect(templateQuestions({ ...EMPTY_RESUME_CONTEXT }, null, "MBA", 5)).toEqual([]);
  });
  it("derives subjects from common degree names", () => {
    expect(subjectOf({ ...EMPTY_RESUME_CONTEXT }, "BTech Computer Science")).toBe("computer science");
    expect(subjectOf({ ...EMPTY_RESUME_CONTEXT }, "BCom")).toBe("commerce");
    expect(subjectOf({ ...EMPTY_RESUME_CONTEXT }, "BA in English Literature")).toBe("english literature");
    expect(subjectOf({ ...EMPTY_RESUME_CONTEXT, degree_subject: "Computer Science" }, "BTech")).toBe("Computer Science");
  });
  it("does not ask a 'move from' question when the subject already matches the course", () => {
    const qs = templateQuestions({ ...EMPTY_RESUME_CONTEXT, degree_subject: "Business Analytics" }, null, "MSc Business Analytics", 5);
    expect(qs.some((q) => q.question.startsWith("Why have you decided to move"))).toBe(false);
  });
});
