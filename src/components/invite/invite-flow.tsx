"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { brand, DISCLAIMER } from "@/config/brand";
import { BrandMark } from "@/components/brand-mark";
import { Badge, Button, Card, Field, Input, Loading, Notice, Textarea, cx } from "@/components/ui";
import { InterviewRunner, type RunnerApi, type RunnerQuestion } from "@/components/interview/interview-runner";
import { parseSessionConfig } from "@/lib/interview/config";
import { sanitiseResumeContext, type ResumeContext } from "@/lib/ai/context";
import { inviteApi, InviteError, readTokenFromLocation, type OpenResult, type ServerSession } from "@/lib/invite/api";

type Step = "loading" | "invalid" | "welcome" | "cv" | "preparing" | "interview" | "finished" | "exited";

const lines = (v: string) => v.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh flex flex-col">
      <header className="px-4 sm:px-6 py-5 mx-auto w-full max-w-3xl"><BrandMark href="#" compact /></header>
      <main className="flex-1 px-4 sm:px-6 pb-12 mx-auto w-full max-w-3xl">{children}</main>
      <footer className="py-5 text-center text-xs text-muted px-4">{DISCLAIMER}</footer>
    </div>
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

  const load = useCallback(async (t: string) => {
    setStep("loading");
    try {
      const res = await inviteApi(t).open();
      const receivedAt = Date.now();
      setInfo(res.invitation);
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

  if (step === "loading") return <Frame><Loading label="Checking your interview link…" /></Frame>;
  if (step === "invalid" || !info) {
    return (
      <Frame>
        <Card className="p-6 sm:p-8 max-w-lg mx-auto mt-10">
          <h1 className="text-xl font-semibold">{error?.title ?? "Link not valid"}</h1>
          <p className="mt-2 text-muted">{error?.text}</p>
          {token && error?.title === "Connection problem" && <Button className="mt-5" onClick={() => void load(token)}>Try again</Button>}
        </Card>
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
        attemptsLeft={info.attemptsLeft}
        onExit={() => setStep("exited")}
        onAgain={() => { setSession(null); void start(); }}
      />
    );
  }

  if (step === "exited" || step === "finished") {
    return (
      <Frame>
        <Card className="p-6 sm:p-8 max-w-lg mx-auto mt-10 text-center">
          <h1 className="text-xl font-semibold">{step === "finished" ? "Interview completed" : "You can close this window"}</h1>
          <p className="mt-2 text-muted">
            {step === "finished"
              ? `You have completed your mock interview for ${info.courseName} at ${info.universityName}. Your adviser can see your progress.`
              : "Your camera and microphone are off. Nothing was recorded."}
          </p>
        </Card>
      </Frame>
    );
  }

  if (step === "preparing") return <Frame><Loading label="Preparing your questions… this can take up to 30 seconds." /></Frame>;

  if (step === "welcome") {
    return (
      <Frame>
        <div className="pt-6 sm:pt-12 grid gap-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">Mock interview</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">Welcome to your AI Mock Interview.</h1>
            <p className="mt-2 text-muted">Hello {info.studentName.split(" ")[0]}. This is a timed practice interview, one question at a time.</p>
          </div>
          <Card className="p-5">
            <p className="text-sm text-muted">Practising for</p>
            <p className="mt-1 text-lg font-semibold">{info.courseName}</p>
            <p className="text-ink-2">{info.universityName}</p>
          </Card>
          <ul className="grid gap-2 text-sm text-ink-2">
            <li>1. Check your CV details so your questions fit your background.</li>
            <li>2. Allow your camera and microphone (used live only, <strong>never recorded</strong>).</li>
            <li>3. Practise showing your passport and stating your name and student ID.</li>
            <li>4. Answer each question out loud when the answer timer starts.</li>
          </ul>
          {lastSession?.status === "completed" && <Notice tone="ok">You have completed this interview before. You have {info.attemptsLeft} attempt{info.attemptsLeft === 1 ? "" : "s"} left.</Notice>}
          <div><Button onClick={() => setStep("cv")}>Continue</Button></div>
        </div>
      </Frame>
    );
  }

  return (
    <Frame>
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
    <div className="pt-6 sm:pt-10 grid gap-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">Your background</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">{hasCv ? "Check your details" : "Upload your CV"}</h1>
        <p className="mt-1 text-sm text-muted">Your questions are tailored to your background and your course. Your CV is stored privately and only your adviser can open it.</p>
      </div>
      {error && <Notice tone="danger" title={error.title}>{error.text}</Notice>}

      <Card className="p-5 grid gap-3">
        <div className="flex items-center gap-2"><p className="font-medium">CV / résumé</p>{hasCv && <Badge tone="ok">Provided</Badge>}</div>
        <input ref={fileRef} type="file" accept=".pdf,.docx" className="sr-only" aria-label="Upload CV" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
        <div
          role="button" tabIndex={0}
          onClick={() => fileRef.current?.click()}
          onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && fileRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); const file = e.dataTransfer.files?.[0]; if (file) upload(file); }}
          className={cx("flex flex-col items-center justify-center gap-1 rounded-xl border border-dashed px-4 py-6 text-center cursor-pointer transition", drag ? "border-accent bg-accent-soft" : "border-line hover:border-accent/60")}
        >
          <span className="text-sm font-medium">{busy ? "Reading your CV…" : hasCv ? "Replace CV (optional)" : "Choose your CV or drop it here"}</span>
          <span className="text-xs text-muted">PDF or DOCX, up to 5 MB</span>
        </div>
        {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      </Card>

      <form key={JSON.stringify(ctx)} onSubmit={confirmAndStart} className="grid gap-4">
        <Card className="p-5 grid gap-4">
          <p className="font-medium">Review your background <span className="text-sm font-normal text-muted">(optional — correct anything that is wrong)</span></p>
          <Field label="Previous qualification"><Input name="previous_qualification" maxLength={200} defaultValue={info.previousQualification ?? ""} placeholder="e.g. BCom, BSc Computer Science" /></Field>
          <Field label="Qualifications" hint="One per line."><Textarea name="qualifications" rows={2} defaultValue={ctx.qualifications.map((q) => q.title).join("\n")} /></Field>
          <Field label="Experience" hint="One role per line."><Textarea name="experience" rows={2} defaultValue={ctx.experience.map((x) => [x.role, x.organisation].filter(Boolean).join(", ")).join("\n")} /></Field>
          <Field label="Projects" hint="One per line."><Textarea name="projects" rows={2} defaultValue={ctx.projects.join("\n")} /></Field>
          <Field label="Skills" hint="Comma separated."><Input name="skills" defaultValue={ctx.skills.join(", ")} /></Field>
          <Field label="Career objective"><Textarea name="career_objective" rows={2} defaultValue={ctx.career_objective ?? ""} /></Field>
        </Card>
        <div className="flex flex-col sm:flex-row gap-3">
          <Button type="submit" disabled={busy}>{busy ? "Please wait…" : "Continue to camera check"}</Button>
        </div>
        <p className="text-xs text-muted">Next we prepare all your questions, then check your camera and microphone. Nothing is recorded.</p>
      </form>
    </div>
  );
}
