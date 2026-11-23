import { describe, expect, it } from "vitest";
import { selectBankQuestions, type BankQuestion } from "@/lib/questions/select";
import { buildGenerationContext, redactPersonalData } from "@/lib/ai/context";
import { validateGenerated } from "@/lib/ai/validate";
import { basicResumeExtract } from "@/lib/ai/resume-basic";

const UNI_A = "uni-a";
const UNI_B = "uni-b";

function q(id: string, category: string, extra: Partial<BankQuestion> = {}): BankQuestion {
  return {
    id,
    question_text: `Question ${id}?`,
    question_type: "question",
    category_id: category,
    country: "UK",
    applicable_university_ids: [],
    is_active: true,
    review_status: "approved",
    is_sensitive: false,
    is_mandatory: false,
    similarity_group: id,
    prep_seconds: null,
    answer_seconds: null,
    submission_mode: null,
    ...extra,
  };
}

const seeded = (seed: number) => () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);

describe("bank selection", () => {
  const bank: BankQuestion[] = [
    q("why1", "why_uk"), q("why2", "why_uk"), q("course1", "why_course"), q("course2", "why_course"),
    q("budget1", "budgeting"), q("career1", "career_goals"), q("career2", "career_goals"),
    q("chester", "why_university", { applicable_university_ids: [UNI_B] }),
    q("health", "other", { is_sensitive: true }),
    q("pending", "why_uk", { is_active: false, review_status: "pending_review" }),
    q("dupA", "uk_culture", { similarity_group: "weather" }), q("dupB", "uk_culture", { similarity_group: "weather" }),
    q("intro", "identity", { question_type: "identity_instruction" }),
    q("us", "why_uk", { country: "US" }),
  ];

  it("never includes other-university, sensitive, unapproved, intro or other-country questions", () => {
    for (let s = 1; s < 30; s++) {
      const picked = selectBankQuestions(bank, { country: "UK", universityId: UNI_A, count: 20, includeSensitive: false, random: seeded(s) });
      const ids = picked.map((p) => p.id);
      expect(ids).not.toContain("chester");
      expect(ids).not.toContain("health");
      expect(ids).not.toContain("pending");
      expect(ids).not.toContain("intro");
      expect(ids).not.toContain("us");
      expect(new Set(ids).size).toBe(ids.length);
      expect(ids.filter((i) => i === "dupA" || i === "dupB").length).toBeLessThanOrEqual(1);
    }
  });

  it("includes the restricted question for its own university and sensitive ones when the template allows", () => {
    const picked = selectBankQuestions(bank, { country: "UK", universityId: UNI_B, count: 20, includeSensitive: true, random: seeded(3) });
    expect(picked.map((p) => p.id)).toEqual(expect.arrayContaining(["chester", "health"]));
  });

  it("spreads across categories and varies between sessions", () => {
    const a = selectBankQuestions(bank, { country: "UK", universityId: UNI_A, count: 4, includeSensitive: false, random: seeded(1) });
    expect(new Set(a.map((p) => p.category_id)).size).toBe(4);
    const recent = new Set(a.map((p) => p.id));
    const b = selectBankQuestions(bank, { country: "UK", universityId: UNI_A, count: 4, includeSensitive: false, recentIds: recent, random: seeded(2) });
    expect(b.filter((p) => recent.has(p.id)).length).toBeLessThan(4);
  });

  it("orders questions in natural interview order", () => {
    const picked = selectBankQuestions(bank, { country: "UK", universityId: UNI_A, count: 6, includeSensitive: false, random: seeded(7) });
    const firstWhy = picked.findIndex((p) => p.category_id === "why_uk");
    const firstCareer = picked.findIndex((p) => p.category_id === "career_goals");
    if (firstWhy >= 0 && firstCareer >= 0) expect(firstWhy).toBeLessThan(firstCareer);
  });
});

describe("AI context", () => {
  const base = {
    profile: {
      previous_qualification: "BCom",
      resume_context: { qualifications: [{ title: "BCom Accounting", institution: "X College", year: "2023" }], skills: ["Excel"], projects: [], experience: [], career_objective: "Data analyst" },
      resume_context_status: "confirmed",
    },
    university: { name: "University A", country: "UK" },
    course: { name: "MSc Business Analytics", level: "Postgraduate", description: "desc", modules: ["Data Mining"], is_verified: true },
    details: [{ kind: "campus", content: "Unverified rumour", is_verified: false }],
  };

  it("contains only the selected application and verified facts, no personal identifiers", () => {
    const ctx = buildGenerationContext(base);
    const json = JSON.stringify(ctx);
    expect(ctx.course).toBe("MSc Business Analytics");
    expect(ctx.verifiedCourseFacts?.modules).toEqual(["Data Mining"]);
    expect(json).not.toContain("Unverified rumour");
    expect(json).not.toMatch(/email|student_id|passport|full_name/i);
  });

  it("ignores unconfirmed CV context and unverified course data", () => {
    const ctx = buildGenerationContext({
      ...base,
      profile: { ...base.profile, resume_context_status: "draft" },
      course: { ...base.course, is_verified: false },
    });
    expect(ctx.resume).toBeNull();
    expect(ctx.verifiedCourseFacts).toBeNull();
  });

  it("redacts contact details before text leaves the server", () => {
    const out = redactPersonalData("Jane jane@mail.com +44 7700 900123 https://linkedin.com/in/jane Passport No: K1234567");
    expect(out).not.toMatch(/jane@mail|7700|linkedin|K1234567/);
  });
});

describe("generated question validation", () => {
  const ctx = buildGenerationContext({
    profile: { previous_qualification: "BCom", resume_context: {}, resume_context_status: "none" },
    university: { name: "University A", country: "UK" },
    course: { name: "MSc Business Analytics", level: null, description: null, modules: [], is_verified: false },
    details: [],
  });

  it("accepts relevant personalised questions and rejects fabrication or repeats", () => {
    const res = validateGenerated(
      [
        { question: "How will your previous business education help you succeed in the MSc Business Analytics programme?", category: "academic_background" },
        { question: "Why did you choose University A over the University of Leeds?", category: "why_university" },
        { question: "How will you pay the £18,500 tuition fee?", category: "budgeting" },
        { question: "What do you expect to learn in the module called 'Quantum Marketing'?", category: "course_modules" },
        { question: "Have you ever received a visa refusal?", category: "student_visa" },
        { question: "Tell me about yourself", category: "general_personality" },
      ],
      ctx,
      ["Have you ever received a visa refusal?"],
    );
    expect(res.accepted.map((a) => a.question)).toEqual([
      "How will your previous business education help you succeed in the MSc Business Analytics programme?",
    ]);
    expect(res.rejected).toHaveLength(5);
  });
});

describe("basic CV extraction", () => {
  it("finds sections without AI", () => {
    const cv = `Jane Doe\nEDUCATION\nBCom, Example College, 2023\nSKILLS\nExcel, SQL, Power BI\nPROJECTS\nSales dashboard for a retail store\nCareer Objective\nBecome a data analyst in retail.`;
    const r = basicResumeExtract(cv);
    expect(r.qualifications[0]).toMatchObject({ title: "BCom, Example College, 2023", year: "2023" });
    expect(r.skills).toEqual(["Excel", "SQL", "Power BI"]);
    expect(r.projects).toHaveLength(1);
    expect(r.career_objective).toMatch(/data analyst/);
  });
});
