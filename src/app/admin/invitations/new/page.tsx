"use client";
import { useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { must, useLoad } from "@/lib/use-load";
import { useAction } from "@/lib/use-action";
import { copyToClipboard, createInvitation, defaultMix, invitationLink } from "@/lib/admin/ops";
import { Button, Card, Checkbox, Field, FlashBar, IconTile, Input, KeyValue, LinkButton, LoadError, Loading, Notice, PageHeader, Section, Segmented, Select, Spinner, cx } from "@/components/ui";
import { ArrowLeft, BookOpenCheck, Check, CheckCircle2, Copy, FileCheck2, FileText, GraduationCap, Link2, Plus, School, Send, SlidersHorizontal, Sparkles, UploadCloud, UserRound, type LucideIcon } from "lucide-react";

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
  const [fileName, setFileName] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const { data, error, loading } = useLoad(async () => {
    const s = createClient();
    const [unis, courses, templates, bank] = await Promise.all([
      s.from("universities").select("id, name, country").eq("is_active", true).order("name"),
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

  const mixSum = effectiveMix.bank + effectiveMix.personal + effectiveMix.course;

  if (created) {
    return (
      <>
        <PageHeader eyebrow="New interview" title="Interview link ready" description={`For ${created.name}. Share it by WhatsApp, email or any other channel.`} />
        <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr] max-w-5xl">
          <Card className="overflow-hidden animate-rise">
            <div className="brand-rule" />
            <div className="p-5 sm:p-7 grid gap-5">
              <div className="flex items-center gap-3"><IconTile icon={CheckCircle2} tone="ok" /><div><p className="font-display text-lg font-semibold">Unique link created</p><p className="text-sm text-muted">Valid only for this student.</p></div></div>
              <div className="flex items-center gap-2 rounded-xl border border-line bg-surface-2 p-2 pl-3.5">
                <Link2 aria-hidden className="size-4 shrink-0 text-muted" />
                <span className="min-w-0 flex-1 font-mono text-xs break-all select-all text-ink-2">{created.url}</span>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => void copyToClipboard(created.url).then(() => setCopied(true))}>{copied ? <><Check /> Copied</> : <><Copy /> Copy link</>}</Button>
                <LinkButton variant="secondary" href={`/admin/invitations/view/?id=${created.id}#personalise`}><Sparkles /> Personalise questions</LinkButton>
                <Button variant="ghost" onClick={() => { setCreated(null); setUni(""); setFileName(null); }}><Plus /> Create another</Button>
              </div>
              {created.resumeMessage && <Notice tone="ok">{created.resumeMessage}</Notice>}
            </div>
          </Card>
          <Section title="How to share" icon={Send}>
            <ol className="grid gap-3 text-sm text-ink-2">
              <li className="flex gap-3"><Num n={1} />Copy the link and send it to the student by WhatsApp or email.</li>
              <li className="flex gap-3"><Num n={2} />Optionally prepare personalised questions from the CV with the free AI.</li>
              <li className="flex gap-3"><Num n={3} />Watch progress live on the dashboard. No student login is needed.</li>
            </ol>
            <p className="mt-4 text-xs text-muted">Anyone with this link can take this student&apos;s interview, so share it only with the student. You can copy it again later, revoke it, or replace it from the dashboard.</p>
          </Section>
        </div>
      </>
    );
  }

  const unis = data.unis;
  const uniCountry = (data.unis as Array<{ id: string; name: string; country?: string }>).find((u) => u.id === uni)?.country;
  const tplName = templateId ? data.templates.find((t) => t.id === templateId)?.name : "Automatic";
  return (
    <>
      <PageHeader eyebrow="Interviews" title="New interview" description="Create a unique interview link for one student." actions={<LinkButton variant="ghost" href="/admin/"><ArrowLeft /> Dashboard</LinkButton>} />
      <FlashBar flash={flash} />
      {!unis.length && <div className="mb-6"><Notice tone="warn">Add a university and course first (Universities).</Notice></div>}
      <form ref={formRef} onSubmit={submit} className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px] items-start">
        <div className="grid gap-5 min-w-0">
          <Section title="Student information" description="Who is taking this interview." icon={UserRound}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Student name"><Input name="student_name" required maxLength={120} placeholder="Full name" /></Field>
              <Field label="Student ID"><Input name="student_ref" required maxLength={60} placeholder="From the offer letter" /></Field>
              <Field label="CV / résumé" optional className="sm:col-span-2" hint="PDF or DOCX. If you skip this, the student can upload it from their link.">
                <label className={cx("flex items-center gap-4 rounded-2xl border-2 border-dashed px-4 py-4 cursor-pointer transition hover:border-accent/60 hover:bg-surface-2/60", fileName ? "border-accent/50 bg-accent-soft" : "border-line-strong")}>
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent-fg">{fileName ? <FileCheck2 className="size-5" /> : <UploadCloud className="size-5" />}</span>
                  <span className="min-w-0 flex-1"><span className="block text-sm font-medium truncate">{fileName ?? "Choose a CV file"}</span><span className="block text-xs text-muted">{fileName ? "Click to replace" : "PDF or DOCX, up to 5 MB"}</span></span>
                  <input ref={fileRef} type="file" accept=".pdf,.docx" className="sr-only" onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)} />
                </label>
              </Field>
            </div>
          </Section>

          <Section title="Academic details" description="University and course drive which questions the student sees." icon={GraduationCap}>
            <div className="grid gap-4 sm:grid-cols-2">
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
              <Field label="Country"><Input value={uniCountry ?? ""} readOnly placeholder="From the university" className="bg-surface-2" /></Field>
              <Field label="Previous qualification" optional><Input name="previous_qualification" maxLength={200} placeholder="e.g. BCom" /></Field>
            </div>
          </Section>

          <Section title="Interview setup" description="Template, number of questions, timing and submission." icon={SlidersHorizontal}>
            <div className="grid gap-5">
              <Field label="Interview template" hint="Automatic uses the university's template or the country default.">
                <Select name="template_id" value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
                  <option value="">Automatic</option>
                  {data.templates.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.prep_seconds}s / {t.answer_seconds}s, {t.submission_mode})</option>)}
                </Select>
              </Field>
              <div className="grid gap-2">
                <span className="text-[13px] font-medium">Number of questions</span>
                <div className="flex flex-wrap items-center gap-3">
                  <Segmented name="preset_ui" ariaLabel="Number of questions" value={preset} onChange={(v) => { setPreset(v); setMixEdited(false); }}
                    options={[...["5", "10", "15", "20", "25", "30"].map((n) => ({ value: n, label: n })), { value: "custom", label: "Custom" }]} />
                  {preset === "custom" && <Input aria-label="Custom number of questions" className="w-28" type="number" min={1} max={60} value={customTotal} onChange={(e) => { setCustomTotal(Number(e.target.value)); setMixEdited(false); }} />}
                </div>
              </div>
              <input type="hidden" name="question_count" value={total} />
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <span className="text-[13px] font-medium">Preparation time</span>
                  <Segmented name="prep_ui" ariaLabel="Preparation time" value={prepSel} onChange={setPrepSel} options={[{ value: "", label: "Default" }, { value: "0", label: "0s" }, { value: "20", label: "20s" }, { value: "30", label: "30s" }, { value: "custom", label: "Custom" }]} />
                  {prepSel === "custom" ? <Input aria-label="Custom preparation seconds" name="prep_seconds" type="number" min={0} max={600} required placeholder="Seconds" /> : <input type="hidden" name="prep_seconds" value={prepSel} />}
                </div>
                <div className="grid gap-2">
                  <span className="text-[13px] font-medium">Answer time</span>
                  <Segmented name="answer_ui" ariaLabel="Answer time" value={answerSel} onChange={setAnswerSel} options={[{ value: "", label: "Default" }, ...["60", "90", "120", "180"].map((v) => ({ value: v, label: `${v}s` })), { value: "custom", label: "Custom" }]} />
                  {answerSel === "custom" ? <Input aria-label="Custom answer seconds" name="answer_seconds" type="number" min={10} max={900} required placeholder="Seconds" /> : <input type="hidden" name="answer_seconds" value={answerSel} />}
                </div>
              </div>
              <div className="grid gap-2">
                <span className="text-[13px] font-medium">Submission</span>
                <Segmented name="submission_mode" ariaLabel="Submission" defaultValue="" options={[{ value: "", label: "Template default" }, { value: "automatic", label: "Automatic" }, { value: "manual", label: "Manual" }]} />
              </div>
              <input type="hidden" name="allow_early_submit_set" value="1" />
              <Checkbox name="allow_early_submit" label="Allow the student to finish an answer early" defaultChecked />
            </div>
          </Section>

          <Section title="AI personalisation" description="How the questions are mixed. Free AI runs in your browser; nothing is sent to a paid service." icon={Sparkles}>
            <div className="grid gap-4 sm:grid-cols-3">
              <MixField icon={BookOpenCheck} label="PDF question bank" name="bank_question_count" max={60} value={effectiveMix.bank} onChange={(v) => { setMixEdited(true); setMix({ ...effectiveMix, bank: v }); }} />
              <MixField icon={FileText} label="Personalised from CV" name="personal_question_count" max={20} value={effectiveMix.personal} onChange={(v) => { setMixEdited(true); setMix({ ...effectiveMix, personal: v }); }} />
              <MixField icon={School} label="Course / university" name="course_question_count" max={20} value={effectiveMix.course} onChange={(v) => { setMixEdited(true); setMix({ ...effectiveMix, course: v }); }} />
            </div>
            <div className="mt-4 flex h-2.5 overflow-hidden rounded-full bg-surface-3" aria-hidden>
              <div className="bg-[#c8961e]" style={{ width: `${(effectiveMix.bank / Math.max(total, mixSum)) * 100}%` }} />
              <div className="bg-[#e8c972]" style={{ width: `${(effectiveMix.personal / Math.max(total, mixSum)) * 100}%` }} />
              <div className="bg-[#fdf6c8] dark:bg-[#8a6410]" style={{ width: `${(effectiveMix.course / Math.max(total, mixSum)) * 100}%` }} />
            </div>
            <div className="mt-4 grid gap-3">
              {mixSum !== total && <Notice tone="warn">The mix adds up to {mixSum}, not {total}.</Notice>}
              {available !== null && available < effectiveMix.bank + effectiveMix.course && (
                <Notice tone="warn">Only {available} different approved bank questions are available for this university. The interview will have fewer bank questions unless you add more personalised questions, or approve more questions in the bank.</Notice>
              )}
              <p className="text-xs text-muted">{available !== null && <>{available} unique approved bank questions available for this university. </>}After you create the link, open the student&apos;s record to analyse the CV, extract the academic background, and generate and preview personalised and course questions with the free AI.</p>
            </div>
          </Section>

          <Section title="Invitation link" description="Expiry and attempts. You can revoke, regenerate or allow a retry later." icon={Link2}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Link expires after (days)"><Input name="expires_in_days" type="number" min={1} max={365} defaultValue={14} /></Field>
              <Field label="Attempts allowed"><Input name="max_attempts" type="number" min={1} max={20} defaultValue={1} /></Field>
            </div>
          </Section>
          <div className="xl:hidden"><Button size="lg" type="submit" className="w-full sm:w-auto" disabled={busy || !unis.length}>{busy ? <><Spinner /> Creating…</> : <><Link2 /> Create interview link</>}</Button></div>
        </div>

        <aside className="hidden xl:block sticky top-8">
          <Card className="overflow-hidden">
            <div className="brand-rule" />
            <div className="p-5 grid gap-4">
              <p className="font-display text-lg font-semibold">Interview summary</p>
              <KeyValue items={[["Questions", total], ["Bank / CV / course", `${effectiveMix.bank} / ${effectiveMix.personal} / ${effectiveMix.course}`], ["Template", tplName ?? "—"], ["Preparation", prepSel === "" ? "Default" : prepSel === "custom" ? "Custom" : `${prepSel}s`], ["Answer", answerSel === "" ? "Default" : answerSel === "custom" ? "Custom" : `${answerSel}s`], ["CV", fileName ? "Attached" : "Student uploads"]]} />
              <Button size="lg" type="submit" className="w-full" disabled={busy || !unis.length}>{busy ? <><Spinner /> Creating…</> : <><Link2 /> Create interview link</>}</Button>
              <p className="text-xs text-muted">The link is unique to this student and works without a login.</p>
            </div>
          </Card>
        </aside>
      </form>
    </>
  );
}

function Num({ n }: { n: number }) {
  return <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-gold-gradient text-xs font-semibold text-[#17150f]">{n}</span>;
}

function MixField({ icon: Icon, label, name, max, value, onChange }: { icon: LucideIcon; label: string; name: string; max: number; value: number; onChange: (v: number) => void }) {
  return (
    <label className="rounded-2xl border border-line bg-surface-2/50 p-4 grid gap-2">
      <span className="flex items-center gap-2 text-[13px] font-medium"><Icon aria-hidden className="size-4 text-accent-fg" />{label}</span>
      <Input name={name} type="number" min={0} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} className="font-display text-lg font-semibold" />
    </label>
  );
}
