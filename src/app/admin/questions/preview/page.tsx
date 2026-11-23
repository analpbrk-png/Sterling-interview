import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { selectBankQuestions, type BankQuestion } from "@/lib/questions/select";
import { Badge, Button, Card, EmptyState, Notice, PageHeader, Select } from "@/components/ui";

export const metadata = { title: "Preview sequence" };

export default async function Preview({ searchParams }: { searchParams: Promise<{ university?: string }> }) {
  const sp = await searchParams;
  await requireAdmin();
  const supabase = await createClient();
  const { data: unis } = await supabase.from("universities").select("id, name, country").order("name");
  const uni = unis?.find((u) => u.id === sp.university);
  let sequence: BankQuestion[] = [];
  let template: { name: string; question_count: number; ai_question_count: number; prep_seconds: number; answer_seconds: number; submission_mode: string; include_sensitive: boolean } | null = null;
  if (uni) {
    const { data: ts } = await supabase.from("interview_templates").select("*").or(`university_id.eq.${uni.id},and(university_id.is.null,is_default.eq.true,country.eq.${uni.country})`);
    template = ts?.find((t) => t.university_id === uni.id) ?? ts?.[0] ?? null;
    const { data: bank } = await supabase.from("question_bank").select("*").eq("is_active", true).eq("review_status", "approved").eq("country", uni.country).eq("question_type", "question");
    if (template) {
      sequence = selectBankQuestions((bank ?? []) as BankQuestion[], { country: uni.country, universityId: uni.id, count: template.question_count - template.ai_question_count, includeSensitive: template.include_sensitive });
    }
  }
  return (
    <>
      <PageHeader title="Preview a student sequence" description={<Link href="/admin/questions" className="text-accent">← Question bank</Link>} />
      <form method="get" className="flex flex-col sm:flex-row gap-3 mb-6 max-w-xl">
        <Select name="university" defaultValue={sp.university ?? ""} aria-label="University"><option value="" disabled>Choose a university…</option>{unis?.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</Select>
        <Button type="submit" variant="secondary">Preview</Button>
      </form>
      {uni && !template && <Notice tone="warn">No template applies to {uni.name}.</Notice>}
      {uni && template && (
        <>
          <p className="text-sm text-muted mb-4">Template <strong>{template.name}</strong>: {template.question_count} questions ({template.ai_question_count} reserved for AI personalisation per student), {template.prep_seconds}s preparation, {template.answer_seconds}s answer, {template.submission_mode} submission. Each run of this page draws a new random mix.</p>
          {sequence.length ? (
            <Card className="divide-y divide-line">
              {sequence.map((q, i) => (
                <div key={q.id} className="p-4 flex gap-3">
                  <span className="text-sm text-muted tabular-nums w-6">{i + 1}.</span>
                  <div className="flex-1"><p className="text-ink">{q.question_text}</p><div className="mt-1.5 flex gap-1.5"><Badge>{q.category_id}</Badge>{q.is_sensitive && <Badge tone="danger">Sensitive</Badge>}<Badge>{q.prep_seconds ?? template!.prep_seconds}s / {q.answer_seconds ?? template!.answer_seconds}s</Badge></div></div>
                </div>
              ))}
              {Array.from({ length: template.ai_question_count }, (_, i) => (
                <div key={`ai${i}`} className="p-4 text-sm text-muted italic">+ personalised AI question for the student&apos;s course and background (falls back to the bank if AI is unavailable)</div>
              ))}
            </Card>
          ) : <EmptyState title="No eligible approved questions">Approve and activate questions in the bank first.</EmptyState>}
        </>
      )}
    </>
  );
}
