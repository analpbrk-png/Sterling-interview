"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { BASE_PATH, createClient } from "@/lib/supabase/client";
import { maybe, must, useLoad, useParam } from "@/lib/use-load";
import { useAction } from "@/lib/use-action";
import { setFlash, useFlash } from "@/lib/flash";
import { deleteQuestion, saveQuestion } from "@/lib/admin/ops";
import { Badge, Button, FlashBar, LoadError, Loading, PageHeader } from "@/components/ui";
import { QuestionForm, type QuestionRow } from "@/components/admin/question-form";

const BLANK: QuestionRow = { question_text: "", category_id: "why_course", question_type: "question", country: "UK", applicable_university_ids: [], prep_seconds: null, answer_seconds: null, submission_mode: null, is_mandatory: false, is_sensitive: false, sensitivity_reason: null, is_active: false, review_status: "pending_review", review_notes: null };

export default function EditQuestion() {
  const id = useParam("id");
  const { user } = useAuth();
  const router = useRouter();
  const [pageFlash] = useFlash();
  const { run, busy, flash } = useAction();
  const { data, error, loading, reload } = useLoad(async () => {
    if (id === undefined) return null;
    const s = createClient();
    const [q, categories, universities] = await Promise.all([
      id ? s.from("question_bank").select("*").eq("id", id).maybeSingle() : Promise.resolve({ data: null, error: null }),
      s.from("question_categories").select("id, name").order("sort_order"),
      s.from("universities").select("id, name").order("name"),
    ]);
    const row = maybe(q);
    const similar = row?.similarity_group
      ? must(await s.from("question_bank").select("id, question_text, source_file, source_page").eq("similarity_group", row.similarity_group).neq("id", row.id))
      : [];
    return { q: row, categories: must(categories), universities: must(universities), similar };
  }, [id]);
  if (id === undefined || (loading && !data)) return <Loading />;
  if (error || !data || (id && !data.q)) return <LoadError error={error ?? "Question not found."} />;
  const { q, categories, universities, similar } = data;

  const onSave = (form: FormData, intent: "approve" | "reject" | "") => void run(async () => {
    const saved = await saveQuestion(form, intent, user!.id);
    const msg = intent === "approve" ? "Question approved and saved." : "Question saved.";
    if (!id) { setFlash({ tone: "ok", text: msg }); window.location.assign(`${BASE_PATH}/admin/questions/edit/?id=${saved}`); return; }
    await reload();
    return msg;
  });

  return (
    <>
      <PageHeader title={q ? "Edit question" : "Add question"} description={<Link href="/admin/questions/" className="inline-flex items-center gap-1 text-sm font-medium text-accent-fg hover:underline">← Question bank</Link>}
        actions={q ? <div className="flex gap-2 items-center"><Badge>{q.origin}</Badge>{q.source_file && <Badge>{q.source_file} · page {q.source_page}</Badge>}</div> : undefined} />
      <FlashBar flash={flash ?? pageFlash} />
      {similar.length > 0 && (
        <div className="mb-6 rounded-xl bg-warn-soft text-warn p-4 text-sm">
          <p className="font-medium">Similar or duplicate records (kept, not deleted):</p>
          <ul className="mt-1 list-disc pl-5">{similar.map((s) => <li key={s.id}><a className="underline" href={`?id=${s.id}`}>{s.question_text}</a>{s.source_file ? ` — ${s.source_file} p.${s.source_page}` : ""}</li>)}</ul>
        </div>
      )}
      <QuestionForm key={q?.updated_at ?? "new"} q={q ?? BLANK} categories={categories} universities={universities} onSave={onSave} busy={busy} />
      {q && q.origin !== "imported" && (
        <Button className="mt-6" variant="danger" disabled={busy} onClick={() => window.confirm("Delete this question permanently?") && void run(async () => { await deleteQuestion(q.id, q.origin); setFlash({ tone: "ok", text: "Question deleted." }); router.push("/admin/questions/"); })}>Delete question</Button>
      )}
    </>
  );
}
