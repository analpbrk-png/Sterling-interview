import { CATEGORY_ORDER } from "./categories";

export interface BankQuestion {
  id: string;
  origin?: "imported" | "manual" | "ai_generated";
  question_text: string;
  question_type: string;
  category_id: string;
  country: string;
  applicable_university_ids: string[];
  is_active: boolean;
  review_status: string;
  is_sensitive: boolean;
  is_mandatory: boolean;
  similarity_group: string | null;
  prep_seconds: number | null;
  answer_seconds: number | null;
  submission_mode: "manual" | "automatic" | null;
}

export interface SelectOptions {
  country: string;
  universityId: string;
  count: number;
  includeSensitive: boolean;
  /** Question ids asked in this application's recent sessions; avoided when possible. */
  recentIds?: Set<string>;
  random?: () => number;
}

/** True when an approved question may be shown for this university/country. */
export function isEligible(q: BankQuestion, opts: Pick<SelectOptions, "country" | "universityId" | "includeSensitive">): boolean {
  return (
    q.question_type === "question" &&
    q.is_active &&
    q.review_status === "approved" &&
    q.country === opts.country &&
    (q.applicable_university_ids.length === 0 || q.applicable_university_ids.includes(opts.universityId)) &&
    (opts.includeSensitive || !q.is_sensitive)
  );
}

function shuffle<T>(arr: T[], random: () => number): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Picks approved bank questions for one session:
 * mandatory first, then a round-robin across categories so each interview is
 * varied, never two questions from the same similarity group, and recently
 * asked questions only when nothing fresh is left. Returned in interview order.
 */
export function selectBankQuestions(bank: BankQuestion[], opts: SelectOptions): BankQuestion[] {
  const random = opts.random ?? Math.random;
  const recent = opts.recentIds ?? new Set<string>();
  const eligible = bank.filter((q) => isEligible(q, opts));
  const picked: BankQuestion[] = [];
  const usedGroups = new Set<string>();
  const take = (q: BankQuestion) => {
    picked.push(q);
    if (q.similarity_group) usedGroups.add(q.similarity_group);
  };
  const free = (q: BankQuestion) => !picked.includes(q) && !(q.similarity_group && usedGroups.has(q.similarity_group));

  for (const q of shuffle(eligible.filter((q) => q.is_mandatory), random)) {
    if (picked.length < opts.count && free(q)) take(q);
  }

  for (const preferFresh of [true, false]) {
    const byCategory = new Map<string, BankQuestion[]>();
    for (const q of shuffle(eligible, random)) {
      if (preferFresh && recent.has(q.id)) continue;
      const list = byCategory.get(q.category_id) ?? [];
      list.push(q);
      byCategory.set(q.category_id, list);
    }
    const categories = shuffle([...byCategory.keys()], random);
    let progressed = true;
    while (picked.length < opts.count && progressed) {
      progressed = false;
      for (const c of categories) {
        if (picked.length >= opts.count) break;
        const list = byCategory.get(c)!;
        const next = list.find(free);
        if (next) {
          take(next);
          progressed = true;
        }
      }
    }
  }

  return orderForInterview(picked);
}

export function orderForInterview<T extends { category_id: string }>(items: T[]): T[] {
  return items
    .map((q, i) => ({ q, i }))
    .sort((a, b) => (CATEGORY_ORDER[a.q.category_id] ?? 999) - (CATEGORY_ORDER[b.q.category_id] ?? 999) || a.i - b.i)
    .map((x) => x.q);
}
