"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Badge, Button, Card, Field, Input, Notice, Select } from "@/components/ui";
import { checkSupport, getVerified, loadEngine, MODEL_LABEL, setVerified, useLocalAi, type Support, type Verified } from "@/lib/local-ai/engine";
import { generateLocally, type GeneratedQuestion } from "@/lib/local-ai/tasks";
import { EMPTY_RESUME_CONTEXT } from "@/lib/ai/context";

/** Mode shown to admins. "Active" only after a real test generation succeeded on this device. */
export function useAiMode() {
  const s = useLocalAi();
  const [verified, setV] = useState<Verified | null>(null);
  const [support, setSupport] = useState<Support | null>(null);
  useEffect(() => { setV(getVerified()); void checkSupport().then(setSupport).catch(() => setSupport({ ok: false, reason: "Could not check this device.", model: null, details: "" })); }, []);
  const refreshVerified = () => setV(getVerified());
  let mode: { label: string; tone: "ok" | "accent" | "warn" | "danger" | "neutral"; detail: string };
  if (s.state === "checking" || s.state === "loading") mode = { label: "Initializing", tone: "accent", detail: s.text };
  else if (support && !support.ok) mode = { label: "Unsupported Device", tone: "warn", detail: support.reason ?? "" };
  else if (s.state === "error") mode = { label: "Unavailable", tone: "danger", detail: s.text };
  else if (verified) mode = { label: "Free Local AI — Active", tone: "ok", detail: `Tested on this device ${new Date(verified.at).toLocaleString("en-GB")} (${MODEL_LABEL}).` };
  else if (support?.ok) mode = { label: "Not tested yet", tone: "neutral", detail: "This device supports the free local AI. Run “Test Free AI” to download and verify it." };
  else mode = { label: "Checking device…", tone: "neutral", detail: "" };
  return { status: s, verified, support, mode, refreshVerified };
}

export function AiProgress() {
  const s = useLocalAi();
  if (s.state !== "loading" && s.state !== "checking") return null;
  return (
    <div className="grid gap-1.5" role="status" aria-live="polite">
      <div className="h-2 rounded-full bg-line overflow-hidden"><div className="h-full bg-accent transition-[width] duration-300" style={{ width: `${Math.round(s.progress * 100)}%` }} /></div>
      <p className="text-xs text-muted break-words">{Math.round(s.progress * 100)}% · {s.text}</p>
    </div>
  );
}

const SAMPLE = {
  profile: { ...EMPTY_RESUME_CONTEXT, degree_subject: "Commerce", qualifications: [{ title: "BCom (Accounting)" }], skills: ["Excel", "SQL"], career_objective: "Work as a business analyst" },
  previousQualification: "BCom",
};

export function LocalAiPanel({ courses }: { courses: Array<{ id: string; name: string; modules: string[]; is_verified: boolean; university: { name: string; country: string } }> }) {
  const { mode, support, verified, refreshVerified } = useAiMode();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "danger" | "warn"; text: string } | null>(null);
  const [sample, setSample] = useState<GeneratedQuestion[] | null>(null);
  const [courseId, setCourseId] = useState("");
  const [background, setBackground] = useState("BCom");

  async function testAi() {
    setBusy(true); setMsg(null); setSample(null);
    try {
      await loadEngine();
      const started = Date.now();
      const { accepted } = await generateLocally({
        kind: "personal", count: 3, profile: SAMPLE.profile, previousQualification: SAMPLE.previousQualification,
        university: "Sample University", country: "UK", course: "MSc Business Analytics", verifiedModules: [], verifiedFacts: [], avoid: [],
      });
      if (accepted.length < 2) throw new Error("The model ran but did not produce enough valid personalised questions. Try again.");
      setVerified({ model: MODEL_LABEL, at: new Date().toISOString(), sample: accepted.map((a) => a.question) });
      refreshVerified();
      setSample(accepted);
      setMsg({ tone: "ok", text: `Free local AI works on this device: ${accepted.length} personalised questions generated in ${Math.round((Date.now() - started) / 1000)} s.` });
    } catch (e) {
      setVerified(null); refreshVerified();
      setMsg({ tone: "danger", text: `Free local AI is not available: ${e instanceof Error ? e.message : "unknown error"}. Interviews will use the PDF question bank plus clearly-labelled template questions.` });
    } finally { setBusy(false); }
  }

  async function sampleQuestions() {
    const c = courses.find((x) => x.id === courseId);
    if (!c) { setMsg({ tone: "warn", text: "Choose a course." }); return; }
    setBusy(true); setMsg(null); setSample(null);
    try {
      const prof = { ...EMPTY_RESUME_CONTEXT, qualifications: background ? [{ title: background }] : [] };
      const base = { profile: prof, previousQualification: background || null, university: c.university.name, country: c.university.country, course: c.name, verifiedModules: c.is_verified ? c.modules : [], verifiedFacts: [], avoid: [] };
      // One model on one GPU: run sequentially.
      const personal = await generateLocally({ ...base, kind: "personal", count: 3 });
      const course = await generateLocally({ ...base, kind: "course", count: 2 });
      setSample([...personal.accepted, ...course.accepted]);
      setMsg({ tone: "ok", text: "Sample questions generated on this device. Nothing was saved." });
    } catch (e) {
      setMsg({ tone: "danger", text: e instanceof Error ? e.message : "Generation failed." });
    } finally { setBusy(false); }
  }

  return (
    <Card className="p-5 grid gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="font-semibold">Free AI question generator</h2>
        <Badge tone={mode.tone}>AI Mode: {mode.label}</Badge>
      </div>
      <p className="text-sm text-muted">{mode.detail}</p>
      <ul className="text-xs text-muted grid gap-1">
        <li>• Runs {MODEL_LABEL} in this browser with WebGPU. Free, no API key, no paid service.</li>
        <li>• The model (about 1 GB) downloads once from Hugging Face and is cached by the browser. CV text and questions never leave this device until you save them to your database.</li>
        <li>• Students never download the model. Their interviews use the questions you prepare here.</li>
        {support && <li>• Device check: {support.ok ? "supported" : "not supported"}{support.details ? ` (${support.details})` : ""}.</li>}
      </ul>
      <AiProgress />
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => void testAi()} disabled={busy || (support !== null && !support.ok)}>{busy ? "Working…" : verified ? "Test Free AI again" : "Test Free AI"}</Button>
        <Link href="/admin/questions/?origin=ai_generated" className="inline-flex h-11 items-center px-4 text-sm text-accent">Review generated questions</Link>
        <Link href="/admin/" className="inline-flex h-11 items-center px-4 text-sm text-accent">Regenerate interview questions (open a student)</Link>
      </div>
      <div className="border-t border-line pt-4 grid gap-3">
        <p className="font-medium text-sm">Generate sample questions</p>
        <div className="grid gap-3 sm:grid-cols-[2fr_1fr_auto] sm:items-end">
          <Field label="Course"><Select value={courseId} onChange={(e) => setCourseId(e.target.value)}><option value="">Choose…</option>{courses.map((c) => <option key={c.id} value={c.id}>{c.university.name} — {c.name}</option>)}</Select></Field>
          <Field label="Sample background"><Input value={background} onChange={(e) => setBackground(e.target.value)} placeholder="e.g. BTech Computer Science" /></Field>
          <Button variant="secondary" onClick={() => void sampleQuestions()} disabled={busy || !verified}>Generate</Button>
        </div>
        {!verified && <p className="text-xs text-muted">Run “Test Free AI” first.</p>}
      </div>
      {sample && sample.length > 0 && (
        <ul className="grid gap-2">
          {sample.map((q, i) => <li key={i} className="rounded-xl border border-line px-3 py-2 text-sm"><Badge tone={q.kind === "personal" ? "accent" : "neutral"}>{q.kind === "personal" ? "personalised" : "course"}</Badge> <span className="ml-1">{q.question}</span>{q.basedOn && <span className="block text-xs text-muted mt-1">Based on: {q.basedOn}</span>}</li>)}
        </ul>
      )}
    </Card>
  );
}
