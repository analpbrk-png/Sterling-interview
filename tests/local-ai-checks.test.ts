import { describe, expect, it } from "vitest";
import { backgroundTerms, groundProfile, isCourseSpecific, isPersonalised } from "@/lib/local-ai/checks";

const cv = `EDUCATION
BCom in Accounting, Example College, 2024
EXPERIENCE
Accounts Intern, Example Traders
PROJECTS
Inventory dashboard in Power BI
SKILLS
Excel, SQL, Power BI
CAREER OBJECTIVE
Become a business analyst in retail.`;

describe("grounding of extracted profiles", () => {
  it("keeps facts present in the CV and drops invented ones", () => {
    const p = groundProfile({
      degree_subject: "Accounting",
      qualifications: [{ title: "BCom in Accounting", institution: "Example College", year: "2024" }, { title: "MBA from Harvard", institution: null, year: null }],
      experience: [{ role: "Accounts Intern", organisation: "Example Traders", summary: null }, { role: "Senior Data Scientist", organisation: "Google", summary: null }],
      projects: ["Inventory dashboard in Power BI"],
      skills: ["Excel", "SQL", "Python"],
      academic_interests: [],
      education_gap: "Two-year gap",
      career_objective: "Become a business analyst in retail",
    }, cv);
    expect(p.qualifications.map((q) => q.title)).toEqual(["BCom in Accounting"]);
    expect(p.experience.map((e) => e.role)).toEqual(["Accounts Intern"]);
    expect(p.skills).toEqual(["Excel", "SQL"]);
    expect(p.education_gap).toBeNull(); // the CV states no gap
    expect(p.degree_subject).toBe("Accounting");
  });
});

describe("personalisation checks", () => {
  const terms = backgroundTerms({ qualifications: [{ title: "BCom in Accounting" }], experience: [], projects: [], skills: ["SQL"], career_objective: null }, "BCom", "MSc Business Analytics");
  it("accepts questions that refer to the student's background", () => {
    expect(isPersonalised("How does your background in commerce prepare you for studying Business Analytics?", terms)).toBe(true);
    expect(isPersonalised("How will your SQL experience help you on this course?", terms)).toBe(true);
  });
  it("rejects generic questions with only the course or university swapped in", () => {
    expect(isPersonalised("Why did you choose MSc Business Analytics at University A?", terms)).toBe(false);
  });
  it("recognises course-specific questions", () => {
    expect(isCourseSpecific("What do you hope to learn on the Business Analytics programme?", "MSc Business Analytics", "University A", [])).toBe(true);
    expect(isCourseSpecific("What do you like about British weather?", "MSc Business Analytics", "University A", [])).toBe(false);
    expect(isCourseSpecific("Why are you interested in the Data Mining module?", "MSc Business Analytics", "University A", ["Data Mining"])).toBe(true);
  });
});

import { introducesUnknownNames } from "@/lib/local-ai/checks";
describe("invented names", () => {
  const allowed = "MSc Business Analytics University A UK BCom (Accounting) Commerce Excel SQL";
  it("flags tools and subjects not in the background", () => {
    expect(introducesUnknownNames("What makes you confident interpreting reports using analytics tools like Tableau?", allowed)).toBe("Tableau");
    expect(introducesUnknownNames("How does your degree in Commerce, focusing on Accounting and Business Management, prepare you?", allowed)).toBe("Management");
  });
  it("allows names that are in the background or course", () => {
    expect(introducesUnknownNames("How will your Excel and SQL experience help on the Business Analytics programme?", allowed)).toBeNull();
    expect(introducesUnknownNames("How does your background in Commerce prepare you for studying Business Analytics in the UK?", allowed)).toBeNull();
  });
});

import { wrongPerspective } from "@/lib/local-ai/checks";
import { coreSimilarity } from "@/lib/local-ai/checks";
describe("perspective and near-duplicates", () => {
  it("rejects first-person questions", () => {
    expect(wrongPerspective("How does this course align with my career goal?")).toBe(true);
    expect(wrongPerspective("What appeals to me about the course?")).toBe(true);
    expect(wrongPerspective("How will this course help you reach your goal of \"I want to lead\"?")).toBe(false);
    expect(wrongPerspective("How does your background prepare you?")).toBe(false);
  });
  it("treats rephrasings of the same question as duplicates", () => {
    const c = "MSc Business Analytics";
    expect(coreSimilarity("How does your previous qualification in Mathematics prepare you for studying Business Analytics?", "How does your degree subject, Mathematics, prepare you for the skills required in Business Analytics?", c)).toBeGreaterThanOrEqual(0.6);
    expect(coreSimilarity("How does your previous qualification in Mathematics prepare you for studying Business Analytics?", "Could your interest in time-series forecasting shape your focus on data analysis?", c)).toBeLessThan(0.6);
  });
});
