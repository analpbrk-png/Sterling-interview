"use client";
import Link from "next/link";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { must, useLoad } from "@/lib/use-load";
import { useAuth } from "@/components/auth-provider";
import { AiProgress, useAiMode } from "@/components/admin/local-ai";
import { generateLocally, type GeneratedQuestion } from "@/lib/local-ai/tasks";
import { MODEL_LABEL } from "@/lib/local-ai/engine";
import { EMPTY_RESUME_CONTEXT } from "@/lib/ai/context";
import { Badge, Button, Card, Field, Input, LoadError, Loading, Notice, PageHeader, Select } from "@/components/ui";

/** Course-level question generation with the free local AI. Results go to the bank as pending review. */
export default function Generate() {
  const { user } = useAuth();
  const { mode } = useAiMode();
  const [courseId, setCourseId] = useState("");
  const [background, setBackground] = useState("");
  const [count, setCount] = useState(5);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<GeneratedQuestion[] | null>(null);
  const [msg, setMsg] = useState<{ tone: "ok" | "danger" | "warn"; text: string } | null>(null);
  const { data, error, loading } = useLoad(async () => {
    const s = createClient();
    const [courses, bank] = await Promise.all([
      s.from("courses").select("id, name, modules, is_verified, university_id, universities(name, country)").order("name"),
      s.from("question_bank").select("question_text").eq("question_type", "question").is("invitation_id", null).limit(60),
    ]);
    return { courses: must(courses), bank: must(bank).map((b) => b.question_text) };
  }, []);
  if (loading && !data) return <Loading />;
  if (error || !data) return <LoadError error={error ?? "Not found"} />;
  const aiReady = mode.label === "Free Local AI — Active";
  const c = data.courses.find((x) => x.id === courseId);

  async function generate() {
    if (!c) { setMsg({ tone: "warn", text: "Choose a course." }); return; }
    const u = c.universities as unknown as { name: string; country: string };
    setBusy(true); setMsg(null); setDraft(null);
    try {
      const prof = { ...EMPTY_RESUME_CONTEXT, qualifications: background ? [{ title: background }] : [] };
      const base = { profile: prof, previousQualification: background || null, university: u.name, country: u.country, course: c.name, verifiedModules: c.is_verified ? c.modules : [], verifiedFacts: [], avoid: data!.bank };
      const r = background ? await generateLocally({ ...base, kind: "personal", count }) : await generateLocally({ ...base, kind: "course", count });
      setDraft(r.accepted);
      setMsg({ tone: "ok", text: `Generated ${r.accepted.length} question(s) on this device${r.rejected ? ` (${r.rejected} rejected by the quality checks)` : ""}.` });
    } catch (e) { setMsg({ tone: "danger", text: e instanceof Error ? e.message : "Generation failed." }); }
    finally { setBusy(false); }
  }

  async function save() {
    if (!c || !draft?.length) return;
    const u = c.universities as unknown as { name: string; country: string };
    setBusy(true);
    const { error: err } = await createClient().from("question_bank").insert(draft.map((q) => ({
      question_text: q.question, origin: "ai_generated", category_id: q.category, country: u.country,
      applicable_university_ids: [c.university_id], generated_for_course: c.id, ai_kind: q.kind, ai_model: MODEL_LABEL,
      review_status: "pending_review", is_active: false, created_by: user!.id, review_notes: q.basedOn ? `Based on: ${q.basedOn}` : null,
    })));
    setBusy(false);
    if (err) setMsg({ tone: "danger", text: err.message });
    else { setMsg({ tone: "ok", text: `${draft.length} question(s) saved to the bank as pending review (only for ${u.name}).` }); setDraft(null); }
  }

  return (
    <>
      <PageHeader title="Generate questions with free AI" description={<Link href="/admin/questions/" className="text-accent">← Question bank</Link>} />
      <Card className="p-5 max-w-3xl grid gap-4">
        <div className="flex items-center gap-2"><Badge tone={mode.tone}>AI Mode: {mode.label}</Badge></div>
        {!aiReady && <Notice tone="warn">Run “Test Free AI” in Settings on this device first.</Notice>}
        <p className="text-sm text-muted">Runs on this device ({MODEL_LABEL}). Uses only the course&apos;s verified modules. Saved questions go to the bank as <strong>pending review</strong> and are restricted to that university. For a specific student, use “Personalised questions” on their record instead.</p>
        <AiProgress />
        {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
        <div className="grid gap-3 sm:grid-cols-[2fr_1.2fr_90px]">
          <Field label="Course"><Select value={courseId} onChange={(e) => setCourseId(e.target.value)}><option value="">Choose…</option>{data.courses.map((x) => <option key={x.id} value={x.id}>{(x.universities as unknown as { name: string }).name} — {x.name}{x.is_verified ? "" : " (unverified)"}</option>)}</Select></Field>
          <Field label="Typical background (optional)" hint="Fill to generate background-based questions; leave empty for course questions."><Input value={background} onChange={(e) => setBackground(e.target.value)} placeholder="e.g. BCom" /></Field>
          <Field label="How many"><Input type="number" min={1} max={10} value={count} onChange={(e) => setCount(Math.max(1, Math.min(10, Number(e.target.value) || 1)))} /></Field>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => void generate()} disabled={busy || !aiReady}>{busy ? "Working…" : "Generate"}</Button>
          {draft && draft.length > 0 && <Button variant="secondary" onClick={() => void save()} disabled={busy}>Save {draft.length} for review</Button>}
        </div>
        {draft && <ul className="grid gap-2">{draft.map((q, i) => <li key={i} className="rounded-xl border border-line px-3 py-2 text-sm">{q.question}<span className="block text-xs text-muted mt-1">{q.category} · {q.basedOn}</span></li>)}</ul>}
      </Card>
    </>
  );
}
