"use client";
import Link from "next/link";
import { useCallback, useMemo, useRef, useState } from "react";
import {
  AlertTriangle, ArrowLeft, AudioLines, BarChart3, CheckCircle2, ChevronDown, Clock3, FileText, Gauge, ListChecks,
  Mic, MicOff, Pencil, Printer, Sparkles, Timer, Trash2, Wand2,
} from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { createClient } from "@/lib/supabase/client";
import { maybe, must, useLoad, useParam } from "@/lib/use-load";
import { useAction } from "@/lib/use-action";
import { useLiveChanges } from "@/lib/admin/progress";
import { deleteSessionAudio } from "@/lib/admin/ops";
import { formatDate, formatDuration } from "@/lib/format";
import { AudioPlayer, peaksFrom, type LoadedAudio } from "@/components/admin/analysis/audio-player";
import { BarChart, CategoryChart } from "@/components/admin/analysis/charts";
import { DEFAULT_WHISPER, decodeTo16kMono, transcribe, useWhisperStatus, WHISPER_MODELS, wordCount, type WhisperModelId } from "@/lib/local-ai/whisper";
import { analyseAnswerLocally } from "@/lib/local-ai/analyse";
import { useAiMode, AiProgress } from "@/components/admin/local-ai";
import { classifyFrames, framesFromPcm } from "@/lib/interview/vad";
import { bandFor, DIMENSIONS, RUBRIC_VERSION, wordsPerMinute, type Dimension } from "@/lib/analysis/rubric";
import {
  Badge, Button, Card, EmptyState, FlashBar, KeyValue, LoadError, Loading, Notice, PageHeader, ProgressBar, Section, Select,
  Spinner, StatCard, Textarea, cx,
} from "@/components/ui";

const AUDIO_BUCKET = "interview-audio";

interface Rec {
  id: string; session_question_id: string; storage_path: string; mime_type: string; answer_window_ms: number;
  recorded_duration_ms: number | null; speech_duration_ms: number | null; silence_duration_ms: number | null; speech_is_estimate: boolean;
  is_partial: boolean; upload_status: string; file_size: number | null; created_at: string; vad: Record<string, unknown>;
}
interface Tr { id: string; recording_id: string; transcript_text: string; machine_text: string | null; transcription_status: string; word_count: number | null; model_used: string | null; error: string | null; reviewed_at: string | null }
interface An {
  id: string; recording_id: string; relevance_score: number | null; content_score: number | null; clarity_score: number | null; completeness_score: number | null;
  delivery_score: number | null; overall_practice_score: number | null; reasons: Record<string, string>; strengths: string[]; weaknesses: string[];
  suggestions: string[]; answer_outline: string[]; analysis_status: string; model_used: string | null; rubric_version: string; created_at: string; transcript_snapshot: string | null;
}
interface Q { id: string; position: number; question_text: string; question_id: string | null; answer_seconds: number; state: string; completion_method: string | null; answer_started_at: string | null; completed_at: string | null }

const sec = (ms: number | null | undefined) => (ms == null ? "—" : `${(ms / 1000).toFixed(1)} s`);
const scoreOf = (a: An | undefined, d: Dimension) => (a ? (a[`${d}_score` as keyof An] as number | null) : null);
const ANSWERED = new Set(["completed", "timed_out"]);

export default function InterviewAnalysis() {
  const id = useParam("id");
  const sessionParam = useParam("session");
  const { user } = useAuth();
  const { run, busy, flash } = useAction();
  const [sessionId, setSessionId] = useState<string | null>(null);

  const { data, error, loading, reload } = useLoad(async () => {
    if (!id) return null;
    const s = createClient();
    const inv = maybe(await s.from("interview_invitations")
      .select("id, student_name, student_ref, previous_qualification, resume_context, audio_consent, universities(name), courses(name, modules, is_verified)")
      .eq("id", id).maybeSingle());
    if (!inv) return null;
    const sessions = must(await s.from("interview_sessions").select("id, status, started_at, completed_at, duration_seconds, audio_consent, created_at, question_count")
      .eq("invitation_id", id).order("created_at", { ascending: false }));
    const chosen = sessions.find((x) => x.id === (sessionId ?? sessionParam)) ?? sessions[0] ?? null;
    if (!chosen) return { inv, sessions, session: null, questions: [] as Q[], recs: [] as Rec[], trs: [] as Tr[], ans: [] as An[] };
    const questions = must(await s.from("interview_session_questions").select("id, position, question_text, question_id, answer_seconds, state, completion_method, answer_started_at, completed_at").eq("session_id", chosen.id).order("position")) as Q[];
    const recs = must(await s.from("interview_answer_recordings").select("*").eq("session_id", chosen.id)) as Rec[];
    const ids = recs.map((r) => r.id);
    const trs = ids.length ? must(await s.from("interview_transcripts").select("*").in("recording_id", ids)) as Tr[] : [];
    const ans = ids.length ? must(await s.from("interview_answer_analysis").select("*").in("recording_id", ids)) as An[] : [];
    return { inv, sessions, session: chosen, questions, recs, trs, ans };
  }, [id, sessionId, sessionParam]);
  useLiveChanges(() => void reload(), { sessionId: data?.session?.id ?? null });

  // Decoded audio cache: one download/decode per recording per page view.
  const pcmCache = useRef(new Map<string, { pcm: Float32Array; durationMs: number; blob: Blob }>());
  const [bulk, setBulk] = useState<{ label: string; done: number; total: number } | null>(null);
  const [whisperModel, setWhisperModel] = useState<WhisperModelId>(DEFAULT_WHISPER);
  const [itemBusy, setItemBusy] = useState<string | null>(null);
  const [itemError, setItemError] = useState<Record<string, string>>({});
  const whisper = useWhisperStatus();
  const { mode: aiMode, verified: aiVerified } = useAiMode();

  const download = useCallback(async (rec: Rec) => {
    const hit = pcmCache.current.get(rec.id);
    if (hit) return hit;
    const s = createClient();
    // Short-lived signed URL from the private bucket; admin-only by storage policy.
    const { data: signed, error: e } = await s.storage.from(AUDIO_BUCKET).createSignedUrl(rec.storage_path, 300);
    if (e || !signed) throw new Error("Could not get a secure link to this recording.");
    const res = await fetch(signed.signedUrl);
    if (!res.ok) throw new Error(`Download failed (${res.status}).`);
    const blob = await res.blob();
    const decoded = await decodeTo16kMono(await blob.arrayBuffer());
    const entry = { ...decoded, blob };
    pcmCache.current.set(rec.id, entry);
    // Recordings without a speech measurement (e.g. device could not run the detector) are measured from the file.
    if (rec.speech_duration_ms == null) {
      const v = classifyFrames(framesFromPcm(decoded.pcm, 16000));
      await s.from("interview_answer_recordings").update({
        speech_duration_ms: v.speechMs, silence_duration_ms: Math.max(0, decoded.durationMs - v.speechMs), recorded_duration_ms: rec.recorded_duration_ms ?? decoded.durationMs,
        speech_is_estimate: v.speechIsEstimate, vad: { ...v.vad, measuredFrom: "file" },
      }).eq("id", rec.id);
    }
    return entry;
  }, []);

  const loaderFor = useCallback((rec: Rec) => async (): Promise<LoadedAudio> => {
    try {
      const d = await download(rec);
      // The recorder's measured length is authoritative; decoders may ignore timestamp gaps.
      return { blob: d.blob, url: URL.createObjectURL(d.blob), peaks: peaksFrom(d.pcm), durationMs: rec.recorded_duration_ms ?? d.durationMs };
    } catch (e) {
      // Playback can still work when decoding (for the waveform) is not supported by this browser.
      const s = createClient();
      const { data: signed } = await s.storage.from(AUDIO_BUCKET).createSignedUrl(rec.storage_path, 300);
      if (!signed) throw e;
      const blob = await (await fetch(signed.signedUrl)).blob();
      return { blob, url: URL.createObjectURL(blob), peaks: null, durationMs: rec.recorded_duration_ms };
    }
  }, [download]);

  const transcribeOne = useCallback(async (rec: Rec) => {
    const s = createClient();
    try {
      const d = await download(rec);
      const r = await transcribe(d.pcm, rec.speech_duration_ms, whisperModel);
      const { error: e } = await s.from("interview_transcripts").upsert({
        recording_id: rec.id, transcript_text: r.text, machine_text: r.text, transcription_status: r.status, word_count: wordCount(r.text),
        model_used: `${r.model} (Transformers.js)`, error: null, reviewed_at: null, reviewed_by: null, updated_at: new Date().toISOString(),
      }, { onConflict: "recording_id" });
      if (e) throw new Error(e.message);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Transcription failed.";
      await s.from("interview_transcripts").upsert({ recording_id: rec.id, transcript_text: "", transcription_status: "failed", error: msg.slice(0, 500), model_used: whisperModel, updated_at: new Date().toISOString() }, { onConflict: "recording_id" });
      throw e;
    }
  }, [download, whisperModel]);

  const view = useMemo(() => {
    if (!data?.session) return null;
    const recByQ = new Map(data.recs.map((r) => [r.session_question_id, r]));
    const trByR = new Map(data.trs.map((t) => [t.recording_id, t]));
    const anByR = new Map(data.ans.map((a) => [a.recording_id, a]));
    return { recByQ, trByR, anByR };
  }, [data]);

  const analyseOne = useCallback(async (rec: Rec, q: Q) => {
    if (!data || !view) return;
    const tr = view.trByR.get(rec.id);
    if (!tr || tr.transcription_status !== "completed") throw new Error("Transcribe this answer first.");
    const course = data.inv.courses as unknown as { name: string; modules: string[]; is_verified: boolean };
    const uni = data.inv.universities as unknown as { name: string };
    const rc = (data.inv.resume_context ?? {}) as { qualifications?: Array<{ title?: string }>; degree_subject?: string | null; experience?: Array<{ role?: string }>; career_objective?: string | null };
    const background = [
      data.inv.previous_qualification, rc.degree_subject, ...(rc.qualifications ?? []).map((x) => x.title), ...(rc.experience ?? []).map((x) => x.role), rc.career_objective ? `Goal: ${rc.career_objective}` : null,
    ].filter((x): x is string => !!x && typeof x === "string");
    const words = wordCount(tr.transcript_text);
    const a = await analyseAnswerLocally(
      { question: q.question_text, transcript: tr.transcript_text, university: uni?.name ?? "", course: course?.name ?? "", verifiedModules: course?.is_verified ? course.modules ?? [] : [], background },
      { answerWindowMs: rec.answer_window_ms, recordedMs: rec.recorded_duration_ms, speechMs: rec.speech_duration_ms, speechIsEstimate: rec.speech_is_estimate, wordCount: words },
    );
    const { error: e } = await createClient().from("interview_answer_analysis").upsert({
      recording_id: rec.id, session_question_id: q.id, question_id: q.question_id, rubric_version: RUBRIC_VERSION,
      relevance_score: a.scores.relevance, content_score: a.scores.content, clarity_score: a.scores.clarity, completeness_score: a.scores.completeness,
      delivery_score: a.scores.delivery, overall_practice_score: a.overall, reasons: a.reasons, strengths: a.strengths, weaknesses: a.weaknesses,
      suggestions: a.suggestions, answer_outline: a.outline, transcript_snapshot: tr.transcript_text, model_used: a.model, analysis_status: a.status, created_at: new Date().toISOString(),
    }, { onConflict: "recording_id" });
    if (e) throw new Error(e.message);
  }, [data, view]);

  const runItem = async (key: string, fn: () => Promise<void>) => {
    setItemBusy(key);
    setItemError((m) => { const n = { ...m }; delete n[key]; return n; });
    try { await fn(); await reload(); } catch (e) { setItemError((m) => ({ ...m, [key]: e instanceof Error ? e.message : "Failed" })); await reload(); } finally { setItemBusy(null); }
  };

  const runBulk = async (label: string, items: Array<() => Promise<void>>) => {
    setBulk({ label, done: 0, total: items.length });
    let failed = 0;
    for (let i = 0; i < items.length; i++) {
      try { await items[i](); } catch { failed++; }
      setBulk({ label, done: i + 1, total: items.length });
    }
    setBulk(null);
    await reload();
    return failed;
  };

  if (id === undefined || (loading && !data)) return <Loading />;
  if (error || !data) return <LoadError error={error ?? "Interview not found."} onRetry={reload} />;
  const { inv, sessions, session, questions, recs } = data;
  const uniName = (inv.universities as unknown as { name: string } | null)?.name ?? "—";
  const courseName = (inv.courses as unknown as { name: string } | null)?.name ?? "—";

  const header = (
    <PageHeader eyebrow="Interview analysis" title={inv.student_name}
      description={<span className="inline-flex flex-wrap items-center gap-x-2"><Link href={`/admin/invitations/view/?id=${inv.id}`} className="inline-flex items-center gap-1 text-sm font-medium text-accent-fg hover:underline"><ArrowLeft className="size-3.5" />Student record</Link><span>· {courseName} · {uniName}</span></span>}
      actions={sessions.length > 1 ? (
        <Select aria-label="Attempt" value={session?.id ?? ""} onChange={(e) => setSessionId(e.target.value)} className="w-auto">
          {sessions.map((s, i) => <option key={s.id} value={s.id}>Attempt {sessions.length - i} · {formatDate(s.started_at ?? s.created_at)}</option>)}
        </Select>
      ) : undefined}
    />
  );
  if (!session || !view) return <>{header}<EmptyState icon={Mic} title="No interview yet">The student has not started this interview.</EmptyState></>;

  const answered = questions.filter((q) => ANSWERED.has(q.state));
  const uploaded = recs.filter((r) => r.upload_status === "uploaded");
  const rows = questions.map((q) => {
    const rec = view.recByQ.get(q.id);
    const ok = rec?.upload_status === "uploaded" ? rec : undefined;
    const tr = ok ? view.trByR.get(ok.id) : undefined;
    const an = ok ? view.anByR.get(ok.id) : undefined;
    const words = tr?.transcription_status === "completed" ? wordCount(tr.transcript_text) : null;
    return { q, rec, ok, tr, an, words, wpm: ok ? wordsPerMinute(words, ok.speech_duration_ms) : null };
  });
  const measured = rows.filter((r) => r.ok?.speech_duration_ms != null);
  const totalRecorded = uploaded.reduce((a, r) => a + (r.recorded_duration_ms ?? 0), 0);
  const totalSpeech = measured.reduce((a, r) => a + (r.ok!.speech_duration_ms ?? 0), 0);
  const totalSilence = measured.reduce((a, r) => a + (r.ok!.silence_duration_ms ?? 0), 0);
  const anyEstimate = measured.some((r) => r.ok!.speech_is_estimate);
  const wpms = rows.map((r) => r.wpm).filter((v): v is number => v != null);
  const transcribed = rows.filter((r) => r.tr?.transcription_status === "completed" || r.tr?.transcription_status === "no_speech");
  const analysed = rows.filter((r) => r.an?.analysis_status === "completed");
  const overallScores = analysed.map((r) => r.an!.overall_practice_score).filter((v): v is number => v != null);
  const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);
  const totalWords = rows.reduce((a, r) => a + (r.words ?? 0), 0);
  const noAudio = uploaded.length === 0;
  const declined = session.audio_consent === false && inv.audio_consent === false;
  const needTranscribe = rows.filter((r) => r.ok && (!r.tr || r.tr.transcription_status === "failed"));
  const needAnalyse = rows.filter((r) => r.ok && r.tr?.transcription_status === "completed" && (!r.an || r.an.transcript_snapshot !== r.tr.transcript_text));
  const catRows = DIMENSIONS.map((d) => { const v = analysed.map((r) => scoreOf(r.an, d.key)).filter((x): x is number => x != null); return { label: d.label, value: avg(v), n: v.length }; });

  return (
    <>
      {header}
      <FlashBar flash={flash} />
      <div className="mb-5"><Notice tone="info" title="Practice feedback, not an official evaluation">AI scores and feedback are an educational estimate from a free local model and a machine transcript. They do not predict admission, visa or interview outcomes, and they do not judge honesty, accent or personality.</Notice></div>

      {noAudio && (
        <div className="mb-5"><Notice tone="neutral" title="Audio recording was not available for this interview.">
          {declined ? "The student chose to practise without recording. " : session.audio_consent ? "No recorded answers have been saved yet. " : ""}Question completion is shown below; no speaking time or AI analysis is shown without a recording.
        </Notice></div>
      )}

      {/* Summary */}
      <div className="grid gap-3 grid-cols-2 md:grid-cols-4 mb-6 animate-rise">
        <StatCard label="Questions" value={`${answered.length}/${questions.length}`} icon={ListChecks} tone="accent" hint="Answered / total" />
        <StatCard label="Interview duration" value={session.duration_seconds != null ? formatDuration(session.duration_seconds) : "—"} icon={Clock3} tone="neutral" hint={session.completed_at ? formatDate(session.completed_at) : session.status} />
        <StatCard label="Recorded audio" value={noAudio ? "—" : formatDuration(Math.round(totalRecorded / 1000))} icon={AudioLines} tone="gold" hint={`${uploaded.length} of ${questions.length} answers recorded`} />
        <StatCard label="Actual speaking" value={measured.length ? formatDuration(Math.round(totalSpeech / 1000)) : "—"} icon={Mic} tone="ok" hint={measured.length ? `${Math.round((totalSpeech / Math.max(1, totalRecorded)) * 100)}% of recorded time${anyEstimate ? " · estimate" : ""}` : "Needs recordings"} />
        <StatCard label="Avg speaking / answer" value={measured.length ? sec(totalSpeech / measured.length) : "—"} icon={Timer} tone="neutral" hint={measured.length ? `Silence ${formatDuration(Math.round(totalSilence / 1000))} total` : "—"} />
        <StatCard label="Avg speaking rate" value={wpms.length ? `${avg(wpms)} wpm` : "—"} icon={Gauge} tone="neutral" hint={wpms.length ? `${totalWords} words · ${wpms.length} answers` : "Needs transcripts"} />
        <StatCard label="Transcribed" value={`${transcribed.length}/${uploaded.length || 0}`} icon={FileText} tone="info" hint="Local Whisper" />
        <StatCard label="AI practice score" value={overallScores.length ? avg(overallScores)! : "—"} icon={Sparkles} tone="gold" hint={overallScores.length ? `Based on ${overallScores.length} of ${uploaded.length} answers` : "Not assessed yet"} />
      </div>

      {!noAudio && (
        <Section className="mb-6" icon={Wand2} title="Free local AI" description="Runs in this browser. Audio and transcripts are not sent to any AI service.">
          <div className="grid gap-5 lg:grid-cols-2">
            <div className="grid gap-3 content-start">
              <p className="text-sm font-medium flex items-center gap-2"><FileText className="size-4 text-accent-fg" />Speech to text (Whisper)</p>
              <Select aria-label="Speech model" value={whisperModel} onChange={(e) => setWhisperModel(e.target.value as WhisperModelId)}>
                {Object.entries(WHISPER_MODELS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </Select>
              {whisper.state === "loading" && <><ProgressBar value={whisper.progress * 100} label="Loading speech model" /><p className="text-xs text-muted">{Math.round(whisper.progress * 100)}% · {whisper.text}</p></>}
              {whisper.state === "ready" && <p className="text-xs text-ok">{whisper.text}</p>}
              {whisper.state === "error" && <Notice tone="danger" title="Speech recognition unavailable on this device">{whisper.text}. Recordings remain available for playback.</Notice>}
              <Button variant="secondary" disabled={busy || !!bulk || !needTranscribe.length}
                onClick={() => void run(async () => { const f = await runBulk("Transcribing", needTranscribe.map((r) => () => transcribeOne(r.ok!))); return f ? `${needTranscribe.length - f} transcribed, ${f} failed (see the questions below).` : `${needTranscribe.length} answer(s) transcribed.`; })}>
                <FileText /> {needTranscribe.length ? `Transcribe ${needTranscribe.length} answer${needTranscribe.length === 1 ? "" : "s"}` : "All answers transcribed"}
              </Button>
            </div>
            <div className="grid gap-3 content-start">
              <p className="text-sm font-medium flex items-center gap-2"><Sparkles className="size-4 text-accent-fg" />Answer feedback (local language model)</p>
              <p className="text-xs text-muted">AI Mode: {aiMode.label}. {aiVerified ? "" : "Run “Test Free AI” in AI Settings on this device first."}</p>
              <AiProgress />
              <Button variant="secondary" disabled={busy || !!bulk || !needAnalyse.length || !aiVerified}
                onClick={() => void run(async () => { const f = await runBulk("Analysing", needAnalyse.map((r) => () => analyseOne(r.ok!, r.q))); return f ? `${needAnalyse.length - f} analysed, ${f} failed.` : `${needAnalyse.length} answer(s) analysed.`; })}>
                <Sparkles /> {needAnalyse.length ? `Analyse ${needAnalyse.length} answer${needAnalyse.length === 1 ? "" : "s"}` : "Nothing new to analyse"}
              </Button>
              <p className="text-xs text-muted">Rubric {RUBRIC_VERSION}: relevance, content, clarity and completeness are scored by the model with a written reason; delivery is calculated from measured audio timing only.</p>
            </div>
          </div>
          {bulk && <div className="mt-4"><p className="text-sm mb-1.5 flex items-center gap-2"><Spinner />{bulk.label} {bulk.done} of {bulk.total}…</p><ProgressBar value={(bulk.done / bulk.total) * 100} label={bulk.label} /></div>}
        </Section>
      )}

      {/* Charts */}
      {!noAudio && (
        <div className="mb-8">
          <h2 className="text-xl font-semibold mb-3 flex items-center gap-2"><BarChart3 className="size-5 text-accent-fg" />Analytics</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <BarChart title="AI practice score by question" description="Overall practice score (0–100). n/a = not analysed." max={100} bars={rows.map((r) => ({ label: `Q${r.q.position + 1}`, value: r.an?.overall_practice_score ?? null }))} />
            <BarChart title="Relevance by question" description="How directly each answer addressed its question (0–100)." max={100} bars={rows.map((r) => ({ label: `Q${r.q.position + 1}`, value: scoreOf(r.an, "relevance") }))} />
            <BarChart title="Speaking time by question" description={`Measured speech in seconds${anyEstimate ? " (some are estimates)" : ""}.`} unit=" s" format={(v) => v.toFixed(0)} bars={rows.map((r) => ({ label: `Q${r.q.position + 1}`, value: r.ok?.speech_duration_ms != null ? r.ok.speech_duration_ms / 1000 : null, title: r.ok ? `Q${r.q.position + 1}: ${sec(r.ok.speech_duration_ms)} speech of ${sec(r.ok.answer_window_ms)} allowed` : undefined }))} />
            <BarChart title="Silence by question" description="Recorded time without detected speech, in seconds." unit=" s" tone="muted" format={(v) => v.toFixed(0)} bars={rows.map((r) => ({ label: `Q${r.q.position + 1}`, value: r.ok?.silence_duration_ms != null ? r.ok.silence_duration_ms / 1000 : null }))} />
            <BarChart title="Words per minute by question" description="From transcript words ÷ measured speech time." unit=" wpm" tone="ink" bars={rows.map((r) => ({ label: `Q${r.q.position + 1}`, value: r.wpm }))} />
            <CategoryChart title="Performance by category" rows={catRows} />
          </div>
        </div>
      )}

      {/* Question cards */}
      <h2 className="text-xl font-semibold mb-3">Question-by-question</h2>
      <div className="grid gap-3 mb-8">
        {rows.map((r) => {
          const key = r.ok?.id ?? r.q.id;
          return (
            <details key={r.q.id} className="group rounded-2xl border border-line bg-surface shadow-[var(--shadow-card)] open:shadow-[var(--shadow-pop)]" open={rows.length <= 3}>
              <summary className="flex cursor-pointer list-none items-start gap-3 p-4 sm:p-5">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gold-gradient text-xs font-semibold text-[#17150f]">{r.q.position + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-ink">{r.q.question_text}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
                    <Badge tone={ANSWERED.has(r.q.state) ? "ok" : "neutral"}>{ANSWERED.has(r.q.state) ? (r.q.state === "timed_out" ? "Answered (time up)" : "Answered") : r.q.state.replace("_", " ")}</Badge>
                    {r.ok ? <Badge tone="gold"><Mic className="size-3" /> Recorded {sec(r.ok.recorded_duration_ms)}</Badge> : r.rec ? <Badge tone="warn"><AlertTriangle className="size-3" /> Upload {r.rec.upload_status}</Badge> : <Badge><MicOff className="size-3" /> No recording</Badge>}
                    {r.ok?.speech_duration_ms != null && <Badge>Speech {sec(r.ok.speech_duration_ms)}{r.ok.speech_is_estimate ? " (est.)" : ""}</Badge>}
                    {r.an?.overall_practice_score != null && <Badge tone="accent">Practice score {r.an.overall_practice_score}</Badge>}
                    {r.tr?.transcription_status === "completed" && <Badge tone="info">Transcribed</Badge>}
                  </div>
                </div>
                <ChevronDown aria-hidden className="mt-1 size-5 shrink-0 text-muted transition-transform group-open:rotate-180" />
              </summary>
              <div className="border-t border-line p-4 sm:p-5 grid gap-5">
                {!r.ok ? (
                  <p className="text-sm text-muted">{r.rec ? "The recording for this answer did not finish uploading." : "Audio recording was not available for this question."} No speaking time or AI analysis is shown without a recording.</p>
                ) : (
                  <>
                    <AudioPlayer label={`answer to question ${r.q.position + 1}`} load={loaderFor(r.ok)} />
                    <KeyValue items={[
                      ["Allowed answer time", sec(r.ok.answer_window_ms)],
                      ["Recorded audio", `${sec(r.ok.recorded_duration_ms)}${r.ok.is_partial ? " (partial: resumed after a refresh)" : ""}`],
                      ["Actual speech", r.ok.speech_duration_ms == null ? "Measured when the audio is first played or transcribed" : `${sec(r.ok.speech_duration_ms)}${r.ok.speech_is_estimate ? " (estimate: speech and background noise were not clearly separated)" : ""}`],
                      ["Silence / non-speech", sec(r.ok.silence_duration_ms)],
                      ["Words · speaking rate", r.words != null ? `${r.words} words${r.wpm != null ? ` · ${r.wpm} wpm` : ""}` : "Needs transcript"],
                    ]} />
                    <TranscriptBlock tr={r.tr} busy={itemBusy === `t-${key}`} error={itemError[`t-${key}`]}
                      onTranscribe={() => void runItem(`t-${key}`, () => transcribeOne(r.ok!))}
                      onSave={(text) => void runItem(`e-${key}`, async () => {
                        const { error: e } = await createClient().from("interview_transcripts").update({ transcript_text: text, word_count: wordCount(text), reviewed_at: new Date().toISOString(), reviewed_by: user!.id, updated_at: new Date().toISOString() }).eq("id", r.tr!.id);
                        if (e) throw new Error(e.message);
                      })} />
                    <AnalysisBlock an={r.an} stale={!!r.an && !!r.tr && r.an.transcript_snapshot !== r.tr.transcript_text} canRun={r.tr?.transcription_status === "completed" && !!aiVerified}
                      busy={itemBusy === `a-${key}`} error={itemError[`a-${key}`]} onRun={() => void runItem(`a-${key}`, () => analyseOne(r.ok!, r.q))} />
                  </>
                )}
              </div>
            </details>
          );
        })}
      </div>

      {/* Overall report */}
      <OverallReport
        student={inv.student_name} studentRef={inv.student_ref} university={uniName} course={courseName} date={session.started_at ?? session.created_at}
        total={questions.length} answered={answered.length} recorded={uploaded.length} transcribedN={transcribed.length} analysedN={analysed.length}
        totalSpeechMs={measured.length ? totalSpeech : null} rows={rows} catRows={catRows} noAudio={noAudio}
      />

      {!noAudio && (
        <Section className="mt-6" icon={Trash2} title="Delete recordings" description="Permanently deletes this attempt's audio files, transcripts and analysis. Completion data stays.">
          <Button variant="danger" disabled={busy} onClick={() => window.confirm(`Permanently delete ${uploaded.length} recording(s) and their transcripts and analysis? This cannot be undone.`) && void run(async () => { const n = await deleteSessionAudio([session.id]); pcmCache.current.clear(); await reload(); return `${n} recording(s) deleted.`; })}><Trash2 /> Delete recordings for this attempt</Button>
        </Section>
      )}
    </>
  );
}

function TranscriptBlock({ tr, busy, error, onTranscribe, onSave }: { tr: Tr | undefined; busy: boolean; error?: string; onTranscribe: () => void; onSave: (text: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(tr?.transcript_text ?? "");
  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-display font-semibold flex items-center gap-2"><FileText className="size-4 text-accent-fg" />Transcript</p>
        {tr?.reviewed_at && <Badge tone="ok"><CheckCircle2 className="size-3" /> Corrected by admin</Badge>}
        {tr?.transcription_status === "completed" && !tr.reviewed_at && <Badge>Machine transcript · may contain errors</Badge>}
        <div className="ml-auto flex gap-2">
          {tr?.transcription_status === "completed" && !editing && <Button size="sm" variant="ghost" onClick={() => { setText(tr.transcript_text); setEditing(true); }}><Pencil /> Correct</Button>}
          <Button size="sm" variant="secondary" disabled={busy} onClick={onTranscribe}>{busy ? <><Spinner /> Transcribing…</> : tr ? "Transcribe again" : "Transcribe"}</Button>
        </div>
      </div>
      {error && <Notice tone="danger" title="Transcription failed">{error}. The recording is still available. Retry, or try another device.</Notice>}
      {!tr ? <p className="text-sm text-muted">Not transcribed yet.</p>
        : tr.transcription_status === "no_speech" ? <p className="text-sm text-muted">No speech was detected in this recording, so no transcript was produced (nothing is guessed).</p>
        : tr.transcription_status === "failed" ? <p className="text-sm text-warn">Transcription failed{tr.error ? `: ${tr.error}` : ""}.</p>
        : editing ? (
          <div className="grid gap-2">
            <Textarea rows={5} value={text} onChange={(e) => setText(e.target.value)} aria-label="Transcript" />
            <div className="flex gap-2"><Button size="sm" onClick={() => { onSave(text); setEditing(false); }}>Save correction</Button><Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button></div>
            {tr.machine_text && tr.machine_text !== text && <p className="text-xs text-muted">Original machine transcript is kept for reference.</p>}
          </div>
        ) : <blockquote className="rounded-xl bg-surface-2/60 border border-line p-4 text-[15px] leading-relaxed text-ink whitespace-pre-wrap">{tr.transcript_text}</blockquote>}
      {tr?.model_used && tr.transcription_status !== "failed" && <p className="text-[11px] text-muted">Model: {tr.model_used}</p>}
    </div>
  );
}

function AnalysisBlock({ an, stale, canRun, busy, error, onRun }: { an: An | undefined; stale: boolean; canRun: boolean; busy: boolean; error?: string; onRun: () => void }) {
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-display font-semibold flex items-center gap-2"><Sparkles className="size-4 text-accent-fg" />AI practice feedback</p>
        {stale && <Badge tone="warn">Transcript changed since analysis</Badge>}
        <Button size="sm" variant="secondary" className="ml-auto" disabled={busy || !canRun} onClick={onRun} title={canRun ? undefined : "Needs a transcript and a tested local AI on this device"}>
          {busy ? <><Spinner /> Analysing…</> : an ? "Analyse again" : "Analyse"}
        </Button>
      </div>
      {error && <Notice tone="danger" title="Analysis failed">{error}</Notice>}
      {!an ? <p className="text-sm text-muted">Not analysed yet.</p> : (
        <>
          {an.analysis_status === "insufficient_evidence" && <Notice tone="neutral">Not enough spoken content to assess this answer. No content scores were given.</Notice>}
          <ul className="grid gap-2 sm:grid-cols-2">
            {DIMENSIONS.map((d) => {
              const v = scoreOf(an, d.key);
              return (
                <li key={d.key} className="rounded-xl border border-line p-3">
                  <div className="flex items-baseline justify-between gap-2"><span className="text-sm font-medium">{d.label}</span><span className="font-display text-lg font-semibold tabular-nums">{v ?? <span className="text-sm font-normal text-muted">Not assessed</span>}</span></div>
                  {v != null && <ProgressBar className="mt-1.5" value={v} label={`${d.label} score`} />}
                  <p className="mt-1.5 text-xs text-muted">{an.reasons?.[d.key] ?? "Not assessed"}{v != null && d.key !== "delivery" ? ` · ${bandFor(v)}` : ""}</p>
                </li>
              );
            })}
          </ul>
          {an.overall_practice_score != null && <p className="text-sm">Overall practice score: <b className="font-display text-lg">{an.overall_practice_score}</b> <span className="text-xs text-muted">(weighted mean of assessed dimensions)</span></p>}
          <div className="grid gap-3 md:grid-cols-2">
            <FeedbackList title="What went well" items={an.strengths} tone="ok" />
            <FeedbackList title="What needs improvement" items={an.weaknesses} tone="warn" />
            <FeedbackList title="How to improve" items={an.suggestions} tone="accent" />
            <FeedbackList title="Suggested answer structure" items={an.answer_outline} tone="neutral" ordered />
          </div>
          <p className="text-[11px] text-muted">{an.model_used} · rubric {an.rubric_version} · {formatDate(an.created_at)}</p>
        </>
      )}
    </div>
  );
}

function FeedbackList({ title, items, tone, ordered }: { title: string; items: string[]; tone: "ok" | "warn" | "accent" | "neutral"; ordered?: boolean }) {
  const dot = tone === "ok" ? "bg-ok" : tone === "warn" ? "bg-warn" : tone === "accent" ? "bg-accent" : "bg-muted";
  return (
    <div className="rounded-xl border border-line p-3">
      <p className="text-sm font-medium mb-2">{title}</p>
      {items.length ? (
        <ul className="grid gap-1.5 text-sm text-ink-2">
          {items.map((t, i) => <li key={i} className="flex gap-2">{ordered ? <span className="text-xs text-muted tabular-nums mt-0.5">{i + 1}.</span> : <span aria-hidden className={cx("mt-2 h-1.5 w-1.5 shrink-0 rounded-full", dot)} />}<span>{t}</span></li>)}
        </ul>
      ) : <p className="text-xs text-muted">None identified.</p>}
    </div>
  );
}

type Row = { q: Q; ok?: Rec; tr?: Tr; an?: An; words: number | null; wpm: number | null };
const RECOMMEND: Record<Dimension, string> = {
  relevance: "Focus on answering the exact question first, in your opening sentence, before adding background.",
  content: "Focus on adding specific examples and reasons (modules, projects, career plans) instead of general statements.",
  clarity: "Focus on a simple structure: main point, reason, example, short conclusion.",
  completeness: "Focus on covering every part of each question, for example all the reasons it asks for.",
  delivery: "Focus on using more of the answer time: practise speaking for at least half of each answer window.",
};

function OverallReport(p: {
  student: string; studentRef: string; university: string; course: string; date: string; total: number; answered: number; recorded: number;
  transcribedN: number; analysedN: number; totalSpeechMs: number | null; rows: Row[]; catRows: Array<{ label: string; value: number | null; n: number }>; noAudio: boolean;
}) {
  const analysed = p.rows.filter((r) => r.an?.analysis_status === "completed");
  const strengths = [...new Set(analysed.flatMap((r) => r.an!.strengths))].slice(0, 5);
  const improvements = [...new Set(analysed.flatMap((r) => r.an!.weaknesses))].slice(0, 5);
  const assessedCats = p.catRows.map((c, i) => ({ ...c, key: DIMENSIONS[i].key })).filter((c) => c.value != null);
  const weakest = assessedCats.sort((a, b) => a.value! - b.value!)[0];
  const lowestQ = analysed.filter((r) => r.an!.overall_practice_score != null).sort((a, b) => a.an!.overall_practice_score! - b.an!.overall_practice_score!)[0];
  const complete = !p.noAudio && p.recorded === p.total && p.analysedN === p.recorded;
  return (
    <Card className="overflow-hidden print:shadow-none">
      <div className="brand-rule" />
      <div className="p-5 sm:p-7 grid gap-5">
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent-fg">Overall interview report</p>
            <h2 className="mt-1 text-2xl font-semibold">{p.student}</h2>
            <p className="text-sm text-muted">ID {p.studentRef} · {p.course} · {p.university} · {formatDate(p.date)}</p>
          </div>
          <Button size="sm" variant="ghost" onClick={() => window.print()}><Printer /> Print</Button>
        </div>
        {!complete && (
          <Notice tone="warn" title="Partial analysis">
            {p.noAudio ? "No recordings exist for this attempt, so there is no speaking or AI analysis." : `${p.recorded} of ${p.total} answers recorded, ${p.transcribedN} transcribed, ${p.analysedN} analysed. The report below covers only analysed answers.`}
          </Notice>
        )}
        <KeyValue items={[
          ["Questions answered", `${p.answered} of ${p.total}`],
          ["Answers recorded", `${p.recorded}`],
          ["Total actual speaking", p.totalSpeechMs != null ? formatDuration(Math.round(p.totalSpeechMs / 1000)) : "—"],
          ["Answers analysed", `${p.analysedN}`],
        ]} />
        {analysed.length > 0 ? (
          <>
            <div className="grid gap-3 md:grid-cols-2">
              <FeedbackList title="Overall strengths" items={strengths} tone="ok" />
              <FeedbackList title="Improvement areas" items={improvements} tone="warn" />
            </div>
            <div className="rounded-2xl bg-accent-soft border border-accent/20 p-4">
              <p className="text-sm font-semibold flex items-center gap-2"><Sparkles className="size-4 text-accent-fg" />Practice recommendation</p>
              <p className="mt-1 text-[15px] text-ink">{weakest ? RECOMMEND[weakest.key] : "Keep practising with full answers to every question."}</p>
              {lowestQ?.an?.suggestions[0] && <p className="mt-2 text-sm text-ink-2">For question {lowestQ.q.position + 1}: {lowestQ.an.suggestions[0]}</p>}
              <p className="mt-2 text-xs text-muted">Based on {analysed.length} analysed answer{analysed.length === 1 ? "" : "s"}. Practice guidance only; not a prediction of any admission or visa decision.</p>
            </div>
            <div>
              <p className="text-sm font-medium mb-2">Question-wise summary</p>
              <ul className="grid gap-2">
                {p.rows.map((r) => (
                  <li key={r.q.id} className="flex gap-3 rounded-xl border border-line p-3 text-sm">
                    <span className="font-display font-semibold text-accent-fg w-7">Q{r.q.position + 1}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-ink">{r.q.question_text}</span>
                      <span className="block text-xs text-muted mt-0.5">
                        {r.ok ? `Speech ${sec(r.ok.speech_duration_ms)}` : "No recording"}
                        {r.an?.overall_practice_score != null ? ` · Practice score ${r.an.overall_practice_score}` : r.ok ? " · Not analysed" : ""}
                        {r.an?.suggestions[0] ? ` · Tip: ${r.an.suggestions[0]}` : ""}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </>
        ) : <EmptyState icon={Sparkles} title="No AI analysis yet">{p.noAudio ? "There are no recordings to analyse." : "Transcribe and analyse the answers above to build this report."}</EmptyState>}
      </div>
    </Card>
  );
}
