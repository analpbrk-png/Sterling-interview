import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { FlashMessage, PageHeader } from "@/components/ui";
import { QuestionForm } from "@/components/admin/question-form";

export const metadata = { title: "Add question" };

export default async function NewQuestion({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  await requireAdmin();
  const supabase = await createClient();
  const [{ data: categories }, { data: universities }] = await Promise.all([
    supabase.from("question_categories").select("id, name").order("sort_order"),
    supabase.from("universities").select("id, name").order("name"),
  ]);
  return (
    <>
      <PageHeader title="Add question" description={<Link href="/admin/questions" className="text-accent">← Question bank</Link>} />
      <FlashMessage searchParams={sp} />
      <QuestionForm
        categories={categories ?? []}
        universities={universities ?? []}
        q={{ question_text: "", category_id: "why_course", question_type: "question", country: "UK", applicable_university_ids: [], prep_seconds: null, answer_seconds: null, submission_mode: null, is_mandatory: false, is_sensitive: false, sensitivity_reason: null, is_active: false, review_status: "pending_review", review_notes: null }}
      />
    </>
  );
}
