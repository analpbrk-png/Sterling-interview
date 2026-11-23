import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Badge, FlashMessage, PageHeader } from "@/components/ui";
import { ConfirmSubmit } from "@/components/ui/submit-button";
import { QuestionForm } from "@/components/admin/question-form";
import { deleteQuestion } from "../../actions";

export default async function EditQuestion({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  await requireAdmin();
  const supabase = await createClient();
  const [{ data: q }, { data: categories }, { data: universities }] = await Promise.all([
    supabase.from("question_bank").select("*").eq("id", id).maybeSingle(),
    supabase.from("question_categories").select("id, name").order("sort_order"),
    supabase.from("universities").select("id, name").order("name"),
  ]);
  if (!q) notFound();
  const { data: similar } = q.similarity_group
    ? await supabase.from("question_bank").select("id, question_text, source_file, source_page").eq("similarity_group", q.similarity_group).neq("id", id)
    : { data: [] };
  return (
    <>
      <PageHeader title="Edit question" description={<Link href="/admin/questions" className="text-accent">← Question bank</Link>}
        actions={<div className="flex gap-2 items-center"><Badge>{q.origin}</Badge>{q.source_file && <Badge>{q.source_file} · page {q.source_page}</Badge>}</div>} />
      <FlashMessage searchParams={sp} />
      {similar && similar.length > 0 && (
        <div className="mb-6 rounded-xl bg-warn-soft text-warn p-4 text-sm">
          <p className="font-medium">Similar or duplicate records (kept, not deleted):</p>
          <ul className="mt-1 list-disc pl-5">{similar.map((s) => <li key={s.id}><Link className="underline" href={`/admin/questions/${s.id}`}>{s.question_text}</Link>{s.source_file ? ` — ${s.source_file} p.${s.source_page}` : ""}</li>)}</ul>
        </div>
      )}
      <QuestionForm q={q} categories={categories ?? []} universities={universities ?? []} />
      {q.origin !== "imported" && (
        <form action={deleteQuestion} className="mt-6"><input type="hidden" name="id" value={q.id} /><ConfirmSubmit variant="danger" message="Delete this question permanently?">Delete question</ConfirmSubmit></form>
      )}
    </>
  );
}
