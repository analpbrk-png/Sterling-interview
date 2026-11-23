"use client";
import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { must, useLoad } from "@/lib/use-load";
import { useAction } from "@/lib/use-action";
import { copyToClipboard, createInvitation, invitationLink } from "@/lib/admin/ops";
import { Button, Card, Checkbox, Field, FlashBar, Input, LinkButton, LoadError, Loading, Notice, PageHeader, Select } from "@/components/ui";

export default function NewInvitation() {
  const { run, busy, flash } = useAction();
  const [uni, setUni] = useState("");
  const [created, setCreated] = useState<{ id: string; url: string; name: string; resumeMessage: string | null } | null>(null);
  const [copied, setCopied] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const { data, error, loading } = useLoad(async () => {
    const s = createClient();
    const [unis, courses, templates] = await Promise.all([
      s.from("universities").select("id, name").eq("is_active", true).order("name"),
      s.from("courses").select("id, name, university_id").eq("is_active", true).order("name"),
      s.from("interview_templates").select("id, name, university_id, question_count, prep_seconds, answer_seconds, submission_mode").order("name"),
    ]);
    return { unis: must(unis), courses: must(courses), templates: must(templates) };
  }, []);
  const courseOptions = useMemo(() => (data?.courses ?? []).filter((c) => c.university_id === uni), [data, uni]);
  if (loading && !data) return <Loading />;
  if (error || !data) return <LoadError error={error ?? "Not found"} />;

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const file = fileRef.current?.files?.[0] ?? null;
    void run(async () => {
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
            <LinkButton variant="secondary" href={`/admin/invitations/view/?id=${created.id}`}>View progress</LinkButton>
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
            <Select name="template_id" defaultValue="">
              <option value="">Automatic</option>
              {data.templates.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.question_count} Q, {t.prep_seconds}s / {t.answer_seconds}s, {t.submission_mode})</option>)}
            </Select>
          </Field>
          <p className="text-sm text-muted -mt-1">Optional overrides for this student. Leave blank to use the template.</p>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Number of questions"><Input name="question_count" type="number" min={1} max={40} /></Field>
            <Field label="Of which AI-personalised"><Input name="ai_question_count" type="number" min={0} max={20} /></Field>
            <Field label="Submission">
              <Select name="submission_mode" defaultValue=""><option value="">Template default</option><option value="automatic">Automatic</option><option value="manual">Manual</option></Select>
            </Field>
            <Field label="Preparation (seconds)"><Input name="prep_seconds" type="number" min={0} max={600} list="prep-presets" /></Field>
            <Field label="Answer (seconds)"><Input name="answer_seconds" type="number" min={10} max={900} list="answer-presets" /></Field>
          </div>
          <datalist id="prep-presets"><option value="0" /><option value="20" /><option value="30" /></datalist>
          <datalist id="answer-presets"><option value="60" /><option value="90" /><option value="120" /><option value="150" /><option value="180" /></datalist>
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
