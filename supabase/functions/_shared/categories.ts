/** System question categories. Admins can add more rows to question_categories. */
export const SYSTEM_CATEGORIES = [
  { id: "identity", name: "Identity and introductory instructions", sort: 10 },
  { id: "why_uk", name: "Why the UK?", sort: 20 },
  { id: "why_university", name: "Why this university?", sort: 30 },
  { id: "why_course", name: "Why this course?", sort: 40 },
  { id: "course_modules", name: "Course modules", sort: 50 },
  { id: "academic_background", name: "Academic background", sort: 60 },
  { id: "employment_experience", name: "Previous employment or experience", sort: 70 },
  { id: "university_research", name: "University research and comparisons", sort: 80 },
  { id: "career_goals", name: "Career goals", sort: 90 },
  { id: "accommodation_transport", name: "Accommodation and transport", sort: 100 },
  { id: "budgeting", name: "Budgeting and financial preparation", sort: 110 },
  { id: "uk_culture", name: "UK culture and student life", sort: 120 },
  { id: "student_visa", name: "Student visa knowledge", sort: 130 },
  { id: "research_decision", name: "Research and decision-making", sort: 140 },
  { id: "general_personality", name: "General personality and unexpected questions", sort: 150 },
  { id: "other", name: "Other", sort: 160 },
] as const;

export type SystemCategoryId = (typeof SYSTEM_CATEGORIES)[number]["id"];

export const CATEGORY_ORDER: Record<string, number> = Object.fromEntries(
  SYSTEM_CATEGORIES.map((c) => [c.id, c.sort]),
);

/** Ordered keyword rules; the first matching rule wins. Used for imports and as a review suggestion. */
const RULES: Array<{ id: SystemCategoryId; patterns: RegExp[] }> = [
  { id: "identity", patterns: [/passport/i, /read the following (words|statement)/i, /out loud/i, /i confirm that/i, /audio check/i] },
  { id: "budgeting", patterns: [/budget/i, /living expenses/i, /fund(s|ing)\b/i, /tuition fee/i, /afford/i] },
  { id: "accommodation_transport", patterns: [/accommodation/i, /commut/i, /roommate|housemate/i, /transport/i] },
  { id: "student_visa", patterns: [/visa/i, /dependant/i, /immigration/i, /return(ing)? to your home country/i, /working while studying/i] },
  { id: "course_modules", patterns: [/module/i, /assessment method/i, /dissertation/i] },
  { id: "university_research", patterns: [/other (uk )?universities/i, /compare different universities/i, /other countries did you consider/i] },
  { id: "research_decision", patterns: [/sources did you use/i, /research/i] },
  { id: "why_university", patterns: [/this university/i, /\bcampus\b/i, /university of [A-Z]/, /teaching and learning/i] },
  { id: "career_goals", patterns: [/career/i, /after (graduating|completing)/i, /long-term goals|short-term/i, /industries, companies/i, /international contacts/i] },
  { id: "academic_background", patterns: [/academic background/i, /previous stud(y|ies)/i, /last education/i, /qualification/i] },
  { id: "employment_experience", patterns: [/work experience/i, /previous (job|employment|role)/i] },
  { id: "why_course", patterns: [/this (particular |specific )?course/i, /degree subject/i, /chosen course/i] },
  { id: "why_uk", patterns: [/study in the uk/i, /uk education system/i, /why the uk/i] },
  { id: "uk_culture", patterns: [/british/i, /\bculture\b/i, /homesick/i, /weather/i, /foods?\b/i, /places in the uk/i] },
  { id: "general_personality", patterns: [/movie/i, /mentor/i, /if you could/i] },
];

export function suggestCategory(text: string): SystemCategoryId {
  for (const rule of RULES) {
    if (rule.patterns.some((p) => p.test(text))) return rule.id;
  }
  return "other";
}
