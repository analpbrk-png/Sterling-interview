"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { brand, DISCLAIMER } from "@/config/brand";
import { SterlingLogo } from "@/components/brand-mark";
import { ArrowRight, ShieldCheck, BookUser, CheckCircle2, ClipboardCheck, FileText, IdCard, Link2Off, Mic, Sparkles, UploadCloud, type LucideIcon } from "lucide-react";
import { Badge, Button, Card, Field, IconTile, Input, Notice, Spinner, Textarea, cx } from "@/components/ui";
import { InterviewRunner, type RunnerApi, type RunnerQuestion } from "@/components/interview/interview-runner";
import { parseSessionConfig } from "@/lib/interview/config";
import { sanitiseResumeContext, type ResumeContext } from "@/lib/ai/context";
import { audioUploadApi, inviteApi, InviteError, readTokenFromLocation, type OpenResult, type ServerSession } from "@/lib/invite/api";

type Step = "loading" | "invalid" | "welcome" | "cv" | "preparing" | "interview" | "finished" | "exited";

const lines = (v: string) => v.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

function Frame({ children, step }: { children: React.ReactNode; step?: 1 | 2 | 3 }) {
  return (
    <div className="min-h-dvh flex flex-col brand-backdrop pt-[env(safe-area-inset-top)]">
      <header className="px-4 sm:px-6 py-4 sm:py-5 mx-auto w-full max-w-3xl flex items-center justify-between gap-4">
        <SterlingLogo width={128} />
        {step && (
          <ol aria-label="Steps" className="flex items-center gap-1.5 text-xs text-muted">
            {["Welcome", "Background", "Interview"].map((l, i) => (
              <li key={l} className="flex items-center gap-1.5">
                <span aria-current={step === i + 1 ? "step" : undefined} className={cx("grid h-6 w-6 place-items-center rounded-full text-[11px] font-semibold", step > i ? "bg-gold-gradient text-[#17150f]" : "bg-surface-3 text-muted")}>{i + 1}</span>
                <span className={cx("hidden sm:inline", step === i + 1 && "text-ink font-medium")}>{l}</span>
                {i < 2 && <span aria-hidden className="mx-1 h-px w-4 bg-line-strong" />}
              </li>
            ))}
          </ol>
        )}
      </header>
      <main className="flex-1 px-4 sm:px-6 pb-12 mx-auto w-full max-w-3xl">{children}</main>
      <footer className="py-5 text-center text-xs text-muted px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]">{DISCLAIMER}</footer>
    </div>
  );
}

function StatusCard({ icon: Icon, tone, title, children }: { icon: LucideIcon; tone: "accent" | "danger" | "ok" | "warn"; title: string; children?: React.ReactNode }) {
  return (
    <Card className="p-7 sm:p-9 max-w-lg mx-auto mt-8 sm:mt-14 text-center animate-rise">
      <div className="mx-auto w-fit"><IconTile icon={Icon} tone={tone} size="lg" /></div>
      <h1 className="mt-5 text-2xl font-semibold">{title}</h1>
      {children}
    </Card>
  );
}

/** Converts server timestamps to this device's clock using the server time from the same response. */
function toRunnerQuestions(session: ServerSession, serverNow: number, receivedAt: number): RunnerQuestion[] {
  const skew = receivedAt - serverNow;
  const t = (iso: string | null) => (iso ? new Date(iso).getTime() + skew : null);
  return session.questions.map((q) => ({
    position: q.position,
    text: q.question_text,
    prepSeconds: q.prep_seconds,
    answerSeconds: q.answer_seconds,
    submissionMode: q.submission_mode,
    state: q.state,
    presentedAt: t(q.presented_at),
    answerStartedAt: t(q.answer_started_at),
  }));
}

export function InviteFlow() {
  const [token, setToken] = useState<string | null>(null);
  const [step, setStep] = useState<Step>("loading");
  const [error, setError] = useState<{ title: string; text: string } | null>(null);
  const [info, setInfo] = useState<OpenResult["invitation"] | null>(null);
  const [lastSession, setLastSession] = useState<OpenResult["lastSession"]>(null);
  const [session, setSession] = useState<{ data: ServerSession; questions: RunnerQuestion[] } | null>(null);
  const api = useMemo(() => (token ? inviteApi(token) : null), [token]);
  const [consent, setConsent] = useState<boolean | null>(null);
  const [savingConsent, setSavingConsent] = useState(false);
  const [consentError, setConsentError] = useState<string | null>(null);

  const load = useCallback(async (t: string) => {
    setStep("loading");
    try {
      const res = await inviteApi(t).open();
      const receivedAt = Date.now();
      setInfo(res.invitation);
      setConsent(res.invitation.audioConsent ?? null);
      setLastSession(res.lastSession);
      if (res.session) {
        setSession({ data: res.session, questions: toRunnerQuestions(res.session, res.serverNow, receivedAt) });
        setStep("interview");
      } else if (res.lastSession?.status === "completed" && res.invitation.attemptsLeft === 0) {
        setStep("finished");
      } else {
        setStep("welcome");
      }
    } catch (e) {
      const err = e instanceof InviteError ? e : new InviteError("Something went wrong.", "unknown", true);
      setError({
        title: err.code === "expired" ? "This link has expired" : err.code === "revoked" ? "This link is no longer active" : err.retryable ? "Connection problem" : "Link not valid",
        text: err.message,
      });
      setStep("invalid");
    }
  }, []);

  useEffect(() => {
    const t = readTokenFromLocation();
    setToken(t);
    if (!t) {
      setError({ title: "Link not valid", text: "Open the full interview link your adviser sent you. It ends with a long code after the # sign." });
      setStep("invalid");
      return;
    }
    void load(t);
  }, [load]);

  const start = useCallback(async () => {
    if (!api) return;
    setStep("preparing");
    setError(null);
    try {
      const res = await api.start();
      setSession({ data: res.session, questions: toRunnerQuestions(res.session, res.serverNow, Date.now()) });
      setStep("interview");
    } catch (e) {
      setError({ title: "Could not prepare the interview", text: e instanceof Error ? e.message : "Please try again." });
      setStep("cv");
    }
  }, [api]);

  const runnerApi: RunnerApi | undefined = useMemo(() => {
    if (!api || !session) return undefined;
    const sid = session.data.id;
    return {
      async progress(item) {
        try {
          await api.progress(sid, item);
        } catch (e) {
          // Retry only network/server failures; a rejected or expired link cannot succeed later.
          if (e instanceof InviteError && !e.retryable) return;
          throw e;
        }
      },
      async complete() {
        const r = await api.complete(sid);
        if (!r.ok) throw new Error(r.reason ?? "not saved");
        return { durationSeconds: r.duration_seconds ?? null, attemptsLeft: r.attemptsLeft };
      },
      abandon: () => api.abandon(sid).then(() => undefined),
    };
  }, [api, session]);

  if (step === "loading") return <Frame><Waiting text="Checking your interview link…" /></Frame>;
  if (step === "invalid" || !info) {
    return (
      <Frame>
        <StatusCard icon={Link2Off} tone="danger" title={error?.title ?? "Link not valid"}>
          <p className="mt-2 text-muted">{error?.text}</p>
          {token && error?.title === "Connection problem" && <Button className="mt-6" onClick={() => void load(token)}>Try again</Button>}
        </StatusCard>
      </Frame>
    );
  }

  if (step === "interview" && session && runnerApi) {
    return (
      <InterviewRunner
        brandName={brand.name}
        session={{
          id: session.data.id,
          universityName: session.data.university_name,
          courseName: session.data.course_name,
          generationNotice: session.data.generation_notice,
          config: parseSessionConfig(session.data.config),
        }}
        questions={session.questions}
        identity={{ fullName: info.studentName, studentId: info.studentId }}
        api={runnerApi}
        audio={info.audioConsent === true && token ? audioUploadApi(token, session.data.id) : null}
        attemptsLeft={info.attemptsLeft}
        onExit={() => setStep("exited")}
        onAgain={() => { setSession(null); void start(); }}
      />
    );
  }

  if (step === "exited" || step === "finished") {
    return (
      <Frame>
        <StatusCard icon={CheckCircle2} tone={step === "finished" ? "ok" : "accent"} title={step === "finished" ? "Interview completed" : "You can close this window"}>
          <p className="mt-2 text-muted">
            {step === "finished"
              ? `You have completed your mock interview for ${info.courseName} at ${info.universityName}. Your adviser can see your progress.`
              : info.audioConsent ? "Your camera and microphone are off. Only the audio of your answers was recorded." : "Your camera and microphone are off. Nothing was recorded."}
          </p>
        </StatusCard>
      </Frame>
    );
  }

  if (step === "preparing") return <Frame step={3}><Waiting text="Preparing your questions…" sub="This can take up to 30 seconds." /></Frame>;

  if (step === "welcome") {
    const first = info.studentName.split(" ")[0];
    const saveConsentAndContinue = async () => {
      if (!api || consent === null) return;
      setSavingConsent(true);
      setConsentError(null);
      try {
        await api.consent(consent);
        setInfo({ ...info, audioConsent: consent });
        setStep("cv");
      } catch (e) {
        setConsentError(e instanceof Error ? e.message : "Could not save your choice. Please try again.");
      } finally {
        setSavingConsent(false);
      }
    };
    return (
      <Frame step={1}>
        <div className="pt-4 sm:pt-10 grid gap-7 animate-rise">
          <div>
            <Badge tone="gold" dot><Sparkles className="size-3" /> AI mock interview</Badge>
            <h1 className="mt-4 text-[32px] sm:text-[44px] font-semibold tracking-tight leading-[1.08] text-balance">Welcome, {first}.<br /><span className="text-gold-gradient">Your interview practice is ready.</span></h1>
            <p className="mt-4 text-[17px] text-muted max-w-xl">A timed practice interview, one question at a time, tailored to your course and background.</p>
          </div>
          <Card className="overflow-hidden">
            <div className="brand-rule" />
            <div className="p-5 sm:p-6 grid sm:grid-cols-[1fr_auto] gap-4 items-center">
              <div className="min-w-0">
                <p className="text-xs font-medium uppercase tracking-wider text-muted">Practising for</p>
                <p className="mt-1.5 font-display text-xl font-semibold">{info.courseName}</p>
                <p className="text-ink-2">{info.universityName}</p>
              </div>
              <div className="flex gap-2 flex-wrap"><Badge>ID {info.studentId}</Badge></div>
            </div>
          </Card>
          <ol className="grid gap-3 sm:grid-cols-2">
            {([[FileText, "Check your CV details", "so your questions fit your background."], [Mic, "Allow camera and microphone", "camera is never recorded."], [IdCard, "Practise your introduction", "passport, full name and student ID."], [ClipboardCheck, "Answer out loud", "when each answer timer starts."]] as const).map(([I, t, d], i) => (
              <li key={t} className="flex gap-3 rounded-2xl border border-line bg-surface p-4">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent-fg"><I className="size-[18px]" strokeWidth={1.8} /></span>
                <span className="text-sm"><span className="block font-medium text-ink">{i + 1}. {t}</span><span className="text-muted">{d}</span></span>
              </li>
            ))}
          </ol>
          {lastSession?.status === "completed" && <Notice tone="ok">You have completed this interview before. You have {info.attemptsLeft} attempt{info.attemptsLeft === 1 ? "" : "s"} left.</Notice>}
          <ConsentCard value={consent} onChange={setConsent} />
          {consentError && <Notice tone="danger">{consentError}</Notice>}
          <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
            <Button size="lg" className="sm:min-w-56" disabled={consent === null || savingConsent} onClick={() => void saveConsentAndContinue()}>
              {savingConsent ? <><Spinner /> Please wait…</> : <>Start interview <ArrowRight /></>}
            </Button>
            <p className="text-xs text-muted">{consent === null ? "Choose a recording option above to continue." : consent ? "Audio of your answers will be recorded. No video." : "Practice only: nothing will be recorded."}</p>
          </div>
        </div>
      </Frame>
    );
  }

  return (
    <Frame step={2}>
      <CvStep info={info} api={api!} error={error} onUpdated={setInfo} onStart={start} />
    </Frame>
  );
}

function CvStep({ info, api, error, onUpdated, onStart }: {
  info: OpenResult["invitation"];
  api: ReturnType<typeof inviteApi>;
  error: { title: string; text: string } | null;
  onUpdated: (i: OpenResult["invitation"]) => void;
  onStart: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "warn" | "danger"; text: string } | null>(null);
  const [drag, setDrag] = useState(false);
  const ctx = info.resumeContext;
  const hasCv = info.resumeStatus !== "none";

  async function upload(file: File) {
    setBusy(true);
    setMsg(null);
    try {
      const res = await api.uploadResume(file);
      onUpdated({ ...info, resumeContext: sanitiseResumeContext(res.context ?? {}), resumeStatus: res.context ? "draft" : info.resumeStatus, resumeExtractionMode: res.mode });
      setMsg({ tone: res.context ? "ok" : "warn", text: res.message });
    } catch (e) {
      setMsg({ tone: "danger", text: e instanceof Error ? e.message : "Upload failed." });
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function confirmAndStart(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const context: ResumeContext = sanitiseResumeContext({
      qualifications: lines(String(f.get("qualifications") ?? "")).map((title) => ({ title })),
      experience: lines(String(f.get("experience") ?? "")).map((role) => ({ role })),
      projects: lines(String(f.get("projects") ?? "")),
      skills: String(f.get("skills") ?? "").split(",").map((s) => s.trim()).filter(Boolean),
      career_objective: String(f.get("career_objective") ?? "").trim() || null,
    });
    const pq = String(f.get("previous_qualification") ?? "").trim() || null;
    const empty = !context.qualifications.length && !context.experience.length && !context.projects.length && !context.skills.length && !context.career_objective;
    setBusy(true);
    try {
      if (!empty || pq) await api.saveProfile(context, pq);
      onStart();
    } catch (err) {
      setMsg({ tone: "danger", text: err instanceof Error ? err.message : "Could not save." });
      setBusy(false);
    }
  }

  return (
    <div className="pt-4 sm:pt-8 grid gap-6 animate-rise">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent-fg">Your background</p>
        <h1 className="mt-2 text-[28px] sm:text-[34px] font-semibold tracking-tight">{hasCv ? "Check your details" : "Upload your CV"}</h1>
        <p className="mt-1 text-sm text-muted">Your questions are tailored to your background and your course. Your CV is stored privately and only your adviser can open it.</p>
      </div>
      {error && <Notice tone="danger" title={error.title}>{error.text}</Notice>}

      <Card className="p-5 sm:p-6 grid gap-4">
        <div className="flex items-center gap-3"><IconTile icon={FileText} tone="accent" size="sm" /><p className="font-display font-semibold text-[17px]">CV / résumé</p>{hasCv && <Badge tone="ok" dot>Provided</Badge>}</div>
        <input ref={fileRef} type="file" accept=".pdf,.docx" className="sr-only" aria-label="Upload CV" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
        <div
          role="button" tabIndex={0}
          onClick={() => fileRef.current?.click()}
          onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && fileRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); const file = e.dataTransfer.files?.[0]; if (file) upload(file); }}
          className={cx("flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-4 py-9 text-center cursor-pointer transition focus-visible:ring-4 focus-visible:ring-[var(--ring)]", drag ? "border-accent bg-accent-soft scale-[1.01]" : "border-line-strong hover:border-accent/60 hover:bg-surface-2/60")}
        >
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-accent-soft text-accent-fg">{busy ? <Spinner className="size-5" /> : <UploadCloud className="size-6" strokeWidth={1.8} />}</span>
          <span className="text-sm font-medium">{busy ? "Reading your CV…" : hasCv ? "Replace CV (optional)" : "Choose your CV or drop it here"}</span>
          <span className="text-xs text-muted">PDF or DOCX, up to 5 MB</span>
        </div>
        {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      </Card>

      <form key={JSON.stringify(ctx)} onSubmit={confirmAndStart} className="grid gap-4">
        <Card className="p-5 sm:p-6 grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2 flex items-start gap-3"><IconTile icon={BookUser} tone="accent" size="sm" /><div><p className="font-display font-semibold text-[17px]">Review your background</p><p className="text-sm text-muted">Optional. Correct anything that is wrong.</p></div></div>
          <Field className="sm:col-span-2" label="Previous qualification"><Input name="previous_qualification" maxLength={200} defaultValue={info.previousQualification ?? ""} placeholder="e.g. BCom, BSc Computer Science" /></Field>
          <Field label="Qualifications" hint="One per line."><Textarea name="qualifications" rows={2} defaultValue={ctx.qualifications.map((q) => q.title).join("\n")} /></Field>
          <Field label="Experience" hint="One role per line."><Textarea name="experience" rows={2} defaultValue={ctx.experience.map((x) => [x.role, x.organisation].filter(Boolean).join(", ")).join("\n")} /></Field>
          <Field label="Projects" hint="One per line."><Textarea name="projects" rows={2} defaultValue={ctx.projects.join("\n")} /></Field>
          <Field label="Skills" hint="Comma separated."><Input name="skills" defaultValue={ctx.skills.join(", ")} /></Field>
          <Field className="sm:col-span-2" label="Career objective"><Textarea name="career_objective" rows={2} defaultValue={ctx.career_objective ?? ""} /></Field>
        </Card>
        <div className="flex flex-col sm:flex-row gap-3">
          <Button size="lg" type="submit" disabled={busy}>{busy ? <><Spinner /> Please wait…</> : <>Continue to camera check <ArrowRight /></>}</Button>
        </div>
        <p className="text-xs text-muted">Next we prepare all your questions, then check your camera and microphone. {info.audioConsent ? "Only your spoken answers will be recorded." : "Nothing is recorded."}</p>
      </form>
    </div>
  );
}

function Waiting({ text, sub }: { text: string; sub?: string }) {
  return (
    <div className="grid place-items-center py-24 text-center" role="status" aria-live="polite">
      <span className="relative grid h-16 w-16 place-items-center">
        <span className="absolute inset-0 rounded-full border-[3px] border-surface-3" />
        <span className="absolute inset-0 rounded-full border-[3px] border-accent border-r-transparent animate-spin" />
        <Sparkles className="size-6 text-accent-fg" />
      </span>
      <p className="mt-6 font-display text-lg font-semibold">{text}</p>
      {sub && <p className="mt-1 text-sm text-muted">{sub}</p>}
    </div>
  );
}

/** Explicit, informed choice before anything is recorded. */
function ConsentCard({ value, onChange }: { value: boolean | null; onChange: (v: boolean) => void }) {
  const opt = (v: boolean, title: string, text: string) => (
    <label className={cx("flex gap-3 rounded-2xl border p-4 cursor-pointer transition", value === v ? "border-accent bg-accent-soft" : "border-line bg-surface hover:border-line-strong")}>
      <input type="radio" name="audio_consent" className="mt-1 h-4 w-4 accent-[var(--accent)]" checked={value === v} onChange={() => onChange(v)} />
      <span className="text-sm"><span className="block font-medium text-ink">{title}</span><span className="text-muted">{text}</span></span>
    </label>
  );
  return (
    <Card className="p-5 sm:p-6 grid gap-4">
      <div className="flex items-start gap-3">
        <IconTile icon={ShieldCheck} tone="accent" size="sm" />
        <div>
          <p className="font-display font-semibold text-[17px]">Recording and privacy</p>
          <p className="mt-1 text-sm text-muted">Please choose before you start.</p>
        </div>
      </div>
      <ul className="grid gap-2 text-sm text-ink-2">
        <li>• If you agree, the <strong>audio of your spoken answers</strong> is recorded, one recording per question, only while the answer timer runs. Preparation time, the passport practice and your camera are <strong>never recorded</strong>.</li>
        <li>• Recordings are stored privately and are available only to your authorised advisers, who may transcribe and review them with AI to give you practice feedback.</li>
        <li>• Recordings are deleted after the retention period set by your adviser. You will not see scores or feedback during the interview.</li>
      </ul>
      <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Recording choice">
        {opt(true, "Record my spoken answers", "Your adviser can listen and give feedback.")}
        {opt(false, "Practise without recording", "Nothing is recorded. Audio playback and analysis will not be available.")}
      </div>
    </Card>
  );
}
