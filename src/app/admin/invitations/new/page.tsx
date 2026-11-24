"use client";
import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { must, useLoad } from "@/lib/use-load";
import { useAction } from "@/lib/use-action";
import { copyToClipboard, createInvitation, defaultMix, invitationLink } from "@/lib/admin/ops";
import { Button, Card, Checkbox, Field, FlashBar, Input, LinkButton, LoadError, Loading, Notice, PageHeader, Select } from "@/components/ui";

export default function NewInvitation() {
  const { run, busy, flash } = useAction();
  const [uni, setUni] = useState("");
  const [preset, setPreset] = useState("15");
  const [customTotal, setCustomTotal] = useState(15);
  const total = preset === "custom" ? Math.max(1, Math.min(60, customTotal || 1)) : Number(preset);
  const [mix, setMix] = useState(defaultMix(15));
  const [mixEdited, setMixEdited] = useState(false);
  const [templateId, setTemplateId] = useState("");
  const [prepSel, setPrepSel] = useState("");
  const [answerSel, setAnswerSel] = useState("");
  const [created, setCreated] = useState<{ id: string; url: string; name: string; resumeMessage: string | null } | null>(null);
  const [copied, setCopied] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const { data, error, loading } = useLoad(async () => {
    const s = createClient();
    const [unis, courses, templates, bank] = await Promise.all([
      s.from("universities").select("id, name").eq("is_active", true).order("name"),
      s.from("courses").select("id, name, university_id").eq("is_active", true).order("name"),
      s.from("interview_templates").select("id, name, university_id, question_count, prep_seconds, answer_seconds, submission_mode, include_sensitive, is_default").order("name"),
      s.from("question_bank").select("id, applicable_university_ids, is_sensitive, similarity_group").eq("is_active", true).eq("review_status", "approved").eq("question_type", "question").is("invitation_id", null),
    ]);
    return { unis: must(unis), courses: must(courses), templates: must(templates), bank: must(bank) };
  }, []);
  const courseOptions = useMemo(() => (data?.courses ?? []).filter((c) => c.university_id === uni), [data, uni]);
  const effectiveMix = mixEdited ? mix : defaultMix(total);
  // Unique approved bank questions this university can use (one per similarity group).
  const available = useMemo(() => {
    if (!data || !uni) return null;
    const tpl = data.templates.find((t) => t.id === templateId) ?? data.templates.find((t) => t.university_id === uni) ?? data.templates.find((t) => t.is_default);
    const ok = data.bank.filter((q) => (q.applicable_university_ids.length === 0 || q.applicable_university_ids.includes(uni)) && (tpl?.include_sensitive || !q.is_sensitive));
    return new Set(ok.map((q) => q.similarity_group ?? q.id)).size;
  }, [data, uni, templateId]);
  if (loading && !data) return <Loading />;
  if (error || !data) return <LoadError error={error ?? "Not found"} />;

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const file = fileRef.current?.files?.[0] ?? null;
    void run(async () => {
      if (effectiveMix.bank + effectiveMix.personal + effectiveMix.course !== total) throw new Error(`The question mix (${effectiveMix.bank} + ${effectiveMix.personal} + ${effectiveMix.course}) must add up to ${total}.`);
      const res = await createInvitation(form, file);
      const url = invitationLink(res.token);
      setCreated({ id: res.id, url, name: String(form.get("student_name")), resumeMessage: res.resumeMessage });
      setCopied(false);
    });
  };

  if (created) {
    return (
      <>
        <PageHeader title="Interview link ready" description={`For ${created.name}. Share it by WhatsApp, email or any other channel.`} />
        <Card className="p-5 sm:p-6 max-w-2xl grid gap-4">
          <div className="rounded-xl border border-line bg-surface-2 p-3 font-mono text-xs break-all select-all">{created.url}</div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void copyToClipboard(created.url).then(() => setCopied(true))}>{copied ? "Copied ✓" : "Copy link"}</Button>
            <LinkButton variant="secondary" href={`/admin/invitations/view/?id=${created.id}#personalise`}>Personalise questions</LinkButton>
            <Button variant="ghost" onClick={() => { setCreated(null); setUni(""); }}>Create another</Button>
          </div>
          {created.resumeMessage && <Notice tone="ok">{created.resumeMessage}</Notice>}
          <p className="text-xs text-muted">Anyone with this link can take this student&apos;s interview, so share it only with the student. You can copy it again later, revoke it, or replace it from the dashboard.</p>
        </Card>
      </>
    );
  }

  const unis = data.unis;
  return (
    <>
      <PageHeader title="New interview" description={<Link href="/admin/" className="text-accent">← Dashboard</Link>} />
      <FlashBar flash={flash} />
      {!unis.length && <div className="mb-6"><Notice tone="warn">Add a university and course first (Universities).</Notice></div>}
      <form ref={formRef} onSubmit={submit} className="grid gap-6 max-w-3xl">
        <Card className="p-5 grid gap-4">
          <h2 className="font-semibold">Student</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Student name"><Input name="student_name" required maxLength={120} /></Field>
            <Field label="Student ID"><Input name="student_ref" required maxLength={60} /></Field>
            <Field label="University">
              <Select name="university_id" required value={uni} onChange={(e) => setUni(e.target.value)}>
                <option value="" disabled>Choose…</option>
                {unis.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </Select>
            </Field>
            <Field label="Course">
              <Select name="course_id" required defaultValue="" key={uni} disabled={!uni}>
                <option value="" disabled>{uni ? (courseOptions.length ? "Choose…" : "No courses yet") : "Choose a university first"}</option>
                {courseOptions.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </Field>
            <Field label="Previous qualification (optional)"><Input name="previous_qualification" maxLength={200} placeholder="e.g. BCom" /></Field>
            <Field label="CV / résumé (optional)" hint="PDF or DOCX. If you skip this, the student can upload it.">
              <Input ref={fileRef} type="file" accept=".pdf,.docx" className="pt-2 file:mr-3 file:rounded-lg file:border-0 file:bg-accent-soft file:px-3 file:py-1.5 file:text-accent" />
            </Field>
          </div>
        </Card>
        <Card className="p-5 grid gap-4">
          <h2 className="font-semibold">Interview settings</h2>
          <Field label="Template" hint="Leave as automatic to use the university's template or the country default.">
            <Select name="template_id" value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
              <option value="">Automatic</option>
              {data.templates.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.prep_seconds}s / {t.answer_seconds}s, {t.submission_mode})</option>)}
            </Select>
          </Field>
          <div className="grid gap-4 sm:grid-cols-[1fr_1fr]">
            <Field label="Number of questions">
              <Select value={preset} onChange={(e) => { setPreset(e.target.value); setMixEdited(false); }}>
                {["5", "10", "15", "20", "25", "30"].map((n) => <option key={n} value={n}>{n} questions{n === "15" ? " (standard)" : ""}</option>)}
                <option value="custom">Custom…</option>
              </Select>
            </Field>
            {preset === "custom" && <Field label="Custom number"><Input type="number" min={1} max={60} value={customTotal} onChange={(e) => { setCustomTotal(Number(e.target.value)); setMixEdited(false); }} /></Field>}
          </div>
          <input type="hidden" name="question_count" value={total} />
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="From the PDF question bank"><Input name="bank_question_count" type="number" min={0} max={60} value={effectiveMix.bank} onChange={(e) => { setMixEdited(true); setMix({ ...effectiveMix, bank: Number(e.target.value) }); }} /></Field>
            <Field label="Personalised from the CV"><Input name="personal_question_count" type="number" min={0} max={20} value={effectiveMix.personal} onChange={(e) => { setMixEdited(true); setMix({ ...effectiveMix, personal: Number(e.target.value) }); }} /></Field>
            <Field label="About the course / university"><Input name="course_question_count" type="number" min={0} max={20} value={effectiveMix.course} onChange={(e) => { setMixEdited(true); setMix({ ...effectiveMix, course: Number(e.target.value) }); }} /></Field>
          </div>
          {effectiveMix.bank + effectiveMix.personal + effectiveMix.course !== total && <Notice tone="warn">The mix adds up to {effectiveMix.bank + effectiveMix.personal + effectiveMix.course}, not {total}.</Notice>}
          {available !== null && available < effectiveMix.bank + effectiveMix.course && (
            <Notice tone="warn">Only {available} different approved bank questions are available for this university. The interview will have fewer bank questions unless you add more personalised questions, or approve more questions in the bank.</Notice>
          )}
          {available !== null && <p className="text-xs text-muted -mt-2">{available} unique approved bank questions available for this university. Personalised and course questions are prepared on the student&apos;s record page with the free AI after you create the link.</p>}
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Preparation time">
              <Select value={prepSel} onChange={(e) => setPrepSel(e.target.value)}><option value="">Template default</option>{["0", "20", "30"].map((v) => <option key={v} value={v}>{v} seconds</option>)}<option value="custom">Custom…</option></Select>
            </Field>
            <Field label="Answer time">
              <Select value={answerSel} onChange={(e) => setAnswerSel(e.target.value)}><option value="">Template default</option>{["60", "90", "120", "150", "180"].map((v) => <option key={v} value={v}>{v} seconds</option>)}<option value="custom">Custom…</option></Select>
            </Field>
            <Field label="Submission">
              <Select name="submission_mode" defaultValue=""><option value="">Template default</option><option value="automatic">Automatic</option><option value="manual">Manual</option></Select>
            </Field>
            {prepSel === "custom" ? <Field label="Custom preparation (s)"><Input name="prep_seconds" type="number" min={0} max={600} required /></Field> : <input type="hidden" name="prep_seconds" value={prepSel} />}
            {answerSel === "custom" ? <Field label="Custom answer (s)"><Input name="answer_seconds" type="number" min={10} max={900} required /></Field> : <input type="hidden" name="answer_seconds" value={answerSel} />}
          </div>
          <input type="hidden" name="allow_early_submit_set" value="1" />
          <Checkbox name="allow_early_submit" label="Allow the student to finish an answer early" defaultChecked />
        </Card>
        <Card className="p-5 grid gap-4">
          <h2 className="font-semibold">Link</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Link expires after (days)"><Input name="expires_in_days" type="number" min={1} max={365} defaultValue={14} /></Field>
            <Field label="Attempts allowed"><Input name="max_attempts" type="number" min={1} max={20} defaultValue={1} /></Field>
          </div>
        </Card>
        <div><Button type="submit" disabled={busy || !unis.length}>{busy ? "Creating…" : "Create interview link"}</Button></div>
      </form>
    </>
  );
}
