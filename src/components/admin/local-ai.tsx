"use client";
import { useEffect, useState } from "react";
import { Badge, Button, Card, Field, IconTile, Input, LinkButton, Notice, Section, Select, Spinner, type TileTone } from "@/components/ui";
import { Cpu, Download, ListChecks, Loader, Play, RefreshCw, ShieldCheck, Sparkles, Wand2, type LucideIcon } from "lucide-react";
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
      <div className="h-2 rounded-full bg-surface-3 overflow-hidden"><div className="h-full bg-gold-gradient transition-[width] duration-300" style={{ width: `${Math.round(s.progress * 100)}%` }} /></div>
      <p className="text-xs text-muted break-words">{Math.round(s.progress * 100)}% · {s.text}</p>
    </div>
  );
}

const SAMPLE = {
  profile: { ...EMPTY_RESUME_CONTEXT, degree_subject: "Commerce", qualifications: [{ title: "BCom (Accounting)" }], skills: ["Excel", "SQL"], career_objective: "Work as a business analyst" },
  previousQualification: "BCom",
};

export function LocalAiPanel({ courses }: { courses: Array<{ id: string; name: string; modules: string[]; is_verified: boolean; university: { name: string; country: string } }> }) {
  const { mode, support, verified, refreshVerified, status } = useAiMode();
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

  const ready = !!verified;
  const loadingNow = status.state === "loading" || status.state === "checking";
  const tiles: Array<{ icon: LucideIcon; label: string; value: string; tone: TileTone }> = [
    { icon: Sparkles, label: "Free AI status", value: mode.label, tone: mode.tone === "ok" ? "ok" : mode.tone === "danger" ? "danger" : mode.tone === "warn" ? "warn" : "gold" },
    { icon: Loader, label: "Initialisation", value: loadingNow ? `${Math.round(status.progress * 100)}% loading` : status.state === "ready" ? "Loaded in this tab" : status.state === "error" ? "Failed" : "Not loaded", tone: status.state === "ready" ? "ok" : status.state === "error" ? "danger" : "neutral" },
    { icon: Cpu, label: "Device / WebGPU", value: support == null ? "Checking…" : support.ok ? "Supported" : "Not supported", tone: support == null ? "neutral" : support.ok ? "ok" : "warn" },
    { icon: Wand2, label: "Personalisation", value: ready ? "Available" : "Templates fallback", tone: ready ? "ok" : "warn" },
  ];
  return (
    <div className="grid gap-5">
      <div className="grid gap-3 grid-cols-2 xl:grid-cols-4">
        {tiles.map((t) => (
          <Card key={t.label} className="p-4">
            <div className="flex items-center gap-2.5"><IconTile icon={t.icon} tone={t.tone} size="sm" /><p className="text-xs text-muted">{t.label}</p></div>
            <p className="mt-3 font-display text-[15px] font-semibold leading-snug">{t.value}</p>
          </Card>
        ))}
      </div>

      <Section title="Free AI question generator" icon={Sparkles} description={mode.detail || "Runs in this browser. No API key, no paid service."}
        actions={<Badge dot tone={mode.tone === "ok" ? "ok" : mode.tone === "danger" ? "danger" : mode.tone === "warn" ? "warn" : "gold"}>AI Mode: {mode.label}</Badge>}>
        <div className="grid gap-5">
          <ul className="grid gap-2.5 sm:grid-cols-3 text-sm">
            {([[Cpu, `Runs ${MODEL_LABEL} in this browser with WebGPU. Free, no API key, no paid service.`], [Download, "The model (about 1 GB) downloads once from Hugging Face and is cached. CV text and questions never leave this device until you save them."], [ShieldCheck, "Students never download the model. Their interviews use the questions you prepare here."]] as const).map(([I, t]) => (
              <li key={t} className="rounded-xl border border-line bg-surface-2/50 p-3.5 text-ink-2"><I aria-hidden className="size-4 text-accent-fg mb-2" />{t}</li>
            ))}
          </ul>
          {support && <p className="text-xs text-muted">Device check: {support.ok ? "supported" : "not supported"}{support.details ? ` (${support.details})` : ""}.</p>}
          <AiProgress />
          {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void testAi()} disabled={busy || (support !== null && !support.ok)}>{busy ? <><Spinner /> Working…</> : <><Play /> {verified ? "Test Free AI again" : "Test Free AI"}</>}</Button>
            <LinkButton variant="secondary" href="/admin/questions/?origin=ai_generated"><ListChecks /> Review generated questions</LinkButton>
            <LinkButton variant="ghost" href="/admin/interviews/"><RefreshCw /> Regenerate for a student</LinkButton>
          </div>
        </div>
      </Section>

      <Section title="Generate sample questions" icon={Wand2} description="Try the generator for a course. Nothing is saved.">
        <div className="grid gap-3 sm:grid-cols-[2fr_1fr_auto] sm:items-end">
          <Field label="Course"><Select value={courseId} onChange={(e) => setCourseId(e.target.value)}><option value="">Choose…</option>{courses.map((c) => <option key={c.id} value={c.id}>{c.university.name} — {c.name}</option>)}</Select></Field>
          <Field label="Sample background"><Input value={background} onChange={(e) => setBackground(e.target.value)} placeholder="e.g. BTech Computer Science" /></Field>
          <Button variant="secondary" onClick={() => void sampleQuestions()} disabled={busy || !verified}><Sparkles /> Generate</Button>
        </div>
        {!verified && <p className="mt-2 text-xs text-muted">Run “Test Free AI” first.</p>}
        {sample && sample.length > 0 && (
          <ul className="mt-4 grid gap-2">
            {sample.map((q, i) => <li key={i} className="rounded-xl border border-line px-4 py-3 text-sm animate-rise"><Badge tone={q.kind === "personal" ? "gold" : "neutral"}>{q.kind === "personal" ? "personalised" : "course"}</Badge> <span className="ml-1">{q.question}</span>{q.basedOn && <span className="block text-xs text-muted mt-1">Based on: {q.basedOn}</span>}</li>)}
          </ul>
        )}
      </Section>
    </div>
  );
}
