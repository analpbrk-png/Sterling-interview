"use client";
import Link from "next/link";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { selectBankQuestions, type BankQuestion } from "@/lib/questions/select";
import { must, useLoad } from "@/lib/use-load";
import { Badge, Button, Card, EmptyState, Loading, Notice, PageHeader, Select } from "@/components/ui";

type Template = { name: string; university_id: string | null; question_count: number; ai_question_count: number; prep_seconds: number; answer_seconds: number; submission_mode: string; include_sensitive: boolean };

export default function Preview() {
  const [uniId, setUniId] = useState("");
  const [nonce, setNonce] = useState(0);
  const { data: unis } = useLoad(async () => must(await createClient().from("universities").select("id, name, country").order("name")), []);
  const { data, loading } = useLoad(async () => {
    const uni = unis?.find((u) => u.id === uniId);
    if (!uni) return null;
    const s = createClient();
    const ts = must(await s.from("interview_templates").select("*").or(`university_id.eq.${uni.id},and(university_id.is.null,is_default.eq.true,country.eq.${uni.country})`)) as Template[];
    const template = ts.find((t) => t.university_id === uni.id) ?? ts[0] ?? null;
    const bank = must(await s.from("question_bank").select("*").eq("is_active", true).eq("review_status", "approved").eq("country", uni.country).eq("question_type", "question")) as BankQuestion[];
    const sequence = template ? selectBankQuestions(bank, { country: uni.country, universityId: uni.id, count: template.question_count - template.ai_question_count, includeSensitive: template.include_sensitive }) : [];
    return { uni, template, sequence };
  }, [uniId, nonce, unis?.length]);
  if (!unis) return <Loading />;
  return (
    <>
      <PageHeader title="Preview a student sequence" description={<Link href="/admin/questions/" className="inline-flex items-center gap-1 text-sm font-medium text-accent-fg hover:underline">← Question bank</Link>} />
      <form className="flex flex-col sm:flex-row gap-3 mb-6 max-w-xl" onSubmit={(e) => { e.preventDefault(); setUniId(String(new FormData(e.currentTarget).get("university") ?? "")); setNonce((n) => n + 1); }}>
        <Select name="university" defaultValue="" aria-label="University"><option value="" disabled>Choose a university…</option>{unis.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</Select>
        <Button type="submit" variant="secondary">Preview</Button>
      </form>
      {uniId && loading && <Loading />}
      {data && !data.template && <Notice tone="warn">No template applies to {data.uni.name}.</Notice>}
      {data?.template && (
        <>
          <p className="text-sm text-muted mb-4">Template <strong>{data.template.name}</strong>: {data.template.question_count} questions ({data.template.ai_question_count} reserved for AI personalisation per student), {data.template.prep_seconds}s preparation, {data.template.answer_seconds}s answer, {data.template.submission_mode} submission. Each preview draws a new random mix.</p>
          {data.sequence.length ? (
            <Card className="divide-y divide-line">
              {data.sequence.map((q, i) => (
                <div key={q.id} className="p-4 flex gap-3">
                  <span className="text-sm text-muted tabular-nums w-6">{i + 1}.</span>
                  <div className="flex-1"><p className="text-ink">{q.question_text}</p><div className="mt-1.5 flex gap-1.5"><Badge>{q.category_id}</Badge>{q.is_sensitive && <Badge tone="danger">Sensitive</Badge>}<Badge>{q.prep_seconds ?? data.template!.prep_seconds}s / {q.answer_seconds ?? data.template!.answer_seconds}s</Badge></div></div>
                </div>
              ))}
              {Array.from({ length: data.template.ai_question_count }, (_, i) => (
                <div key={`ai${i}`} className="p-4 text-sm text-muted italic">+ personalised AI question for the student&apos;s course and background (falls back to the bank if AI is unavailable)</div>
              ))}
            </Card>
          ) : <EmptyState title="No eligible approved questions">Approve and activate questions in the bank first.</EmptyState>}
        </>
      )}
    </>
  );
}
