"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  effectsOf,
  formatClock,
  initialState,
  reduce,
  remainingSeconds,
  restoreBaseline,
  restoreFromServer,
  type Effect,
  type MachineConfig,
  type MachineEvent,
  type MachineQuestion,
  type MachineState,
  type ServerQuestionState,
} from "@/lib/interview/machine";
import type { SessionConfig } from "@/lib/interview/config";
import { ProgressQueue, type ProgressItem, type QueueStatus } from "@/lib/interview/progress-queue";
import { useMediaStream, useMicLevel } from "@/hooks/use-media";
import { playCue, useSpeech } from "@/hooks/use-speech";
import { useClock } from "@/hooks/use-clock";
import { Button, cx } from "@/components/ui";
import { IntroScreen } from "./intro-steps";
import { CameraPreview, MicMeter } from "./media-bits";
import { Completion, type CompletionData } from "./completion";

/** Server state of each question, with times already converted to the client clock. */
export type RunnerQuestion = MachineQuestion & ServerQuestionState;

/**
 * Server calls for a real interview. progress() must throw only for retryable
 * failures (network); a rejected transition resolves normally.
 */
export interface RunnerApi {
  progress(item: ProgressItem): Promise<void>;
  complete(): Promise<{ durationSeconds: number | null; attemptsLeft: number }>;
  abandon(): Promise<void>;
}

export interface RunnerProps {
  brandName: string;
  session: {
    id: string;
    universityName: string;
    courseName: string;
    generationNotice: string | null;
    config: SessionConfig;
  };
  questions: RunnerQuestion[];
  identity: { fullName: string; studentId: string } | null;
  /** Missing only in the development preview: nothing is saved. */
  api?: RunnerApi;
  attemptsLeft?: number;
  onExit: () => void;
  onAgain?: () => void;
}

const TERMINAL = new Set(["completed", "timed_out"]);

export function InterviewRunner({ brandName, session, questions, identity, api, attemptsLeft = 0, onExit, onAgain }: RunnerProps) {
  const previewMode = !api;
  const config: MachineConfig = useMemo(
    () => ({ introSteps: session.config.introSteps, allowEarlySubmit: session.config.allowEarlySubmit, transitionMs: 1200 }),
    [session.config],
  );

  // Resume after refresh: continue from the server's timestamps (timers keep running).
  const firstOpen = questions.findIndex((q) => !TERMINAL.has(q.state));
  const alreadyStarted = questions.some((q) => q.state !== "pending");
  const [needsResume, setNeedsResume] = useState(alreadyStarted);
  const [attemptsAfter, setAttemptsAfter] = useState(attemptsLeft);

  const stateRef = useRef<MachineState>(initialState(questions));
  const [state, setState] = useState<MachineState>(stateRef.current);
  const [syncStatus, setSyncStatus] = useState<QueueStatus>("idle");
  const [completion, setCompletion] = useState<CompletionData | null>(null);
  const [showCamera, setShowCamera] = useState(true);
  const startedAt = useRef<number>(Date.now());

  const media = useMediaStream();
  const level = useMicLevel(media.stream);
  const speech = useSpeech(session.config.ttsDefault, session.config.ttsRate);
  const cueCtx = useRef<AudioContext | null>(null);
  const wakeLock = useRef<WakeLockSentinel | null>(null);

  const queue = useMemo(
    () =>
      new ProgressQueue(async (item) => {
        if (api) await api.progress(item);
      }, setSyncStatus),
    [api],
  );

  const releaseDevices = useCallback(() => {
    media.stop();
    speech.cancel();
    void wakeLock.current?.release().catch(() => {});
    wakeLock.current = null;
  }, [media, speech]);

  const finalize = useCallback(async () => {
    releaseDevices();
    const base: CompletionData = {
      questionsCompleted: stateRef.current.outcomes.filter(Boolean).length,
      questionCount: questions.length,
      durationSeconds: Math.round((Date.now() - startedAt.current) / 1000),
      saved: previewMode ? "preview" : "saving",
    };
    setCompletion(base);
    if (!api) return;
    try {
      await queue.drained();
      const res = await api.complete();
      setAttemptsAfter(res.attemptsLeft);
      setCompletion({ ...base, durationSeconds: res.durationSeconds ?? base.durationSeconds, saved: "saved" });
    } catch {
      setCompletion({ ...base, saved: "failed" });
    }
  }, [api, previewMode, questions.length, queue, releaseDevices]);

  const runEffects = useCallback(
    (effects: Effect[]) => {
      for (const e of effects) {
        if (e.kind === "progress") queue.push({ position: e.position, state: e.state, method: e.method, clientTs: new Date().toISOString() });
        else if (e.kind === "speak") speech.speak(e.text);
        else if (e.kind === "answer_cue") playCue(cueCtx);
        else if (e.kind === "session_complete") void finalize();
      }
    },
    [finalize, queue, speech],
  );

  const dispatch = useCallback(
    (event: MachineEvent) => {
      const prev = stateRef.current;
      const next = reduce(questions, config, prev, event);
      if (next === prev) return;
      stateRef.current = next;
      setState(next);
      runEffects(effectsOf(questions, prev, next));
    },
    [config, questions, runEffects],
  );

  const inQuestions = state.phase === "question";
  const now = useClock(inQuestions);
  useEffect(() => {
    if (inQuestions) dispatch({ type: "TICK", now });
  }, [now, inQuestions, dispatch]);

  // Keep the screen awake and warn before leaving mid-interview.
  useEffect(() => {
    if (!inQuestions) return;
    const nav = navigator as Navigator & { wakeLock?: { request(type: "screen"): Promise<WakeLockSentinel> } };
    nav.wakeLock?.request("screen").then((l) => (wakeLock.current = l)).catch(() => {});
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [inQuestions]);

  const begin = (ev: MachineEvent) => {
    // A user gesture: unlock audio for the answer cue on iOS.
    try {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      cueCtx.current ??= Ctx ? new Ctx() : null;
      void cueCtx.current?.resume();
    } catch {
      // optional
    }
    startedAt.current = Date.now();
    dispatch(ev);
  };

  async function resume() {
    if (media.status !== "ready") await media.request();
    const first = questions.find((q) => q.presentedAt != null)?.presentedAt;
    startedAt.current = first ?? Date.now();
    const s = restoreFromServer(questions, questions, Date.now());
    const prev = restoreBaseline(questions);
    stateRef.current = s;
    setState(s);
    setNeedsResume(false);
    runEffects(effectsOf(questions, prev, s));
  }

  async function endEarly() {
    if (!window.confirm("End this interview now? Your adviser will see it as interrupted.")) return;
    releaseDevices();
    await api?.abandon().catch(() => {});
    onExit();
  }

  // ---------------------------------------------------------------------------
  if (completion) {
    return (
      <Completion
        data={completion}
        universityName={session.universityName}
        courseName={session.courseName}
        onDone={() => { releaseDevices(); onExit(); }}
        onAgain={onAgain && attemptsAfter > 0 ? () => { releaseDevices(); onAgain(); } : undefined}
        onRetrySave={() => void finalize()}
      />
    );
  }

  if (needsResume) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <h1 className="text-2xl font-semibold">Resume your interview</h1>
        <p className="mt-3 text-muted">
          Your interview was interrupted. You will continue at question {Math.max(1, firstOpen + 1)} of {questions.length}. The timer kept running while you were away.
        </p>
        <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
          <Button onClick={resume}>Resume interview</Button>
          <Button variant="secondary" onClick={endEarly}>End interview</Button>
        </div>
      </div>
    );
  }

  if (state.phase === "intro") {
    const steps = session.config.introSteps;
    const prepValues = [...new Set(questions.map((q) => q.prepSeconds))];
    const ansValues = [...new Set(questions.map((q) => q.answerSeconds))];
    const prepSummary =
      prepValues.length === 1 && ansValues.length === 1
        ? `Each question gives you ${prepValues[0]} seconds to prepare, then ${ansValues[0]} seconds to answer.`
        : "Each question has its own preparation and answer time, shown on screen.";
    const isLast = state.step === steps.length - 1;
    return (
      <>
        <TopBar brandName={brandName} label="Introduction" progress={0} onEnd={endEarly} />
        <IntroScreen
          step={steps[state.step]}
          stepIndex={state.step}
          stepCount={steps.length}
          config={session.config}
          universityName={session.universityName}
          courseName={session.courseName}
          questionCount={questions.length}
          prepSummary={prepSummary}
          generationNotice={session.generationNotice}
          identity={identity}
          media={{ stream: media.stream, status: media.status, error: media.error, level, request: () => void media.request() }}
          speech={speech}
          onBack={() => dispatch({ type: "INTRO_BACK" })}
          onNext={() => (isLast ? begin({ type: "INTRO_NEXT", now: Date.now() }) : dispatch({ type: "INTRO_NEXT", now: Date.now() }))}
        />
      </>
    );
  }

  if (state.phase !== "question") return null;

  const q = questions[state.index];
  const remaining = remainingSeconds(state, now);
  const stageLabel =
    state.stage === "preparing" ? "Preparation time" : state.stage === "answering" ? "Answer time" : state.stage === "awaiting_submit" ? "Time is up" : "Answer complete";
  const hint =
    state.stage === "preparing" ? "Think about your answer." : state.stage === "answering" ? "Speak your answer now." : state.stage === "awaiting_submit" ? "Submit your answer to continue." : "Next question coming up…";
  const canSubmit = state.stage === "awaiting_submit" || (state.stage === "answering" && config.allowEarlySubmit);
  const progress = (state.index + (state.stage === "transition" ? 1 : 0)) / questions.length;
  const micOn = !!media.stream?.getAudioTracks().some((t) => t.readyState === "live");

  return (
    <div className="min-h-dvh flex flex-col">
      <TopBar brandName={brandName} label={`Question ${state.index + 1} of ${questions.length}`} progress={progress} onEnd={endEarly} sync={syncStatus} />
      <main className="flex-1 flex flex-col items-center justify-center px-5 sm:px-8 py-8 text-center">
        <div className="w-full max-w-3xl" aria-live="polite">
          <p className={cx("text-xs font-semibold uppercase tracking-[0.16em]", state.stage === "answering" ? "text-accent" : state.stage === "awaiting_submit" ? "text-warn" : "text-muted")}>
            {stageLabel}
          </p>
          <p className="mt-2 text-4xl sm:text-5xl font-medium tabular-nums text-ink-2" aria-label={remaining != null ? `${remaining} seconds remaining` : "Timer stopped"} role="timer">
            {state.stage === "transition" ? "··:··" : formatClock(remaining ?? 0)}
          </p>
          <h1
            key={q.position}
            className={cx(
              "mt-8 sm:mt-10 font-semibold tracking-tight text-ink leading-[1.25] text-balance transition-opacity duration-300",
              q.text.length > 160 ? "text-[clamp(1.3rem,3.2vw,2.1rem)]" : "text-[clamp(1.6rem,4.4vw,2.75rem)]",
              state.stage === "transition" && "opacity-30",
            )}
          >
            {q.text}
          </h1>
          <p className="mt-6 text-sm text-muted">{hint}</p>
        </div>
      </main>
      <footer className="border-t border-line bg-surface/70 backdrop-blur px-4 sm:px-6 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto max-w-5xl flex items-center gap-3 sm:gap-4">
          {showCamera && media.stream?.getVideoTracks().length ? (
            <CameraPreview stream={media.stream} className="w-24 sm:w-32 aspect-video shrink-0" />
          ) : null}
          <div className="flex flex-col gap-1.5 min-w-0">
            <MicMeter level={level} active={micOn} compact />
            <div className="flex gap-3 text-xs">
              {speech.supported && (
                <button type="button" className="text-muted hover:text-ink" onClick={() => speech.setEnabled(!speech.enabled)}>
                  {speech.enabled ? "Mute voice" : "Unmute voice"}
                </button>
              )}
              {media.stream?.getVideoTracks().length ? (
                <button type="button" className="text-muted hover:text-ink" onClick={() => setShowCamera((v) => !v)}>
                  {showCamera ? "Hide camera" : "Show camera"}
                </button>
              ) : null}
            </div>
          </div>
          <div className="ml-auto">
            {canSubmit && (
              <Button onClick={() => dispatch({ type: "SUBMIT", index: state.index, now: Date.now() })} variant={state.stage === "awaiting_submit" ? "primary" : "secondary"}>
                {state.stage === "awaiting_submit" ? "Submit Answer" : "Finish answer early"}
              </Button>
            )}
          </div>
        </div>
      </footer>
    </div>
  );
}

function TopBar({ brandName, label, progress, onEnd, sync }: { brandName: string; label: string; progress: number; onEnd: () => void; sync?: QueueStatus }) {
  return (
    <header className="sticky top-0 z-10 bg-bg/90 backdrop-blur">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 h-14 flex items-center gap-3 text-sm">
        <span className="font-semibold text-ink truncate">{brandName}</span>
        <span className="text-muted">·</span>
        <span className="text-ink-2 whitespace-nowrap">{label}</span>
        {sync === "retrying" && <span className="text-xs text-warn whitespace-nowrap">Reconnecting…</span>}
        <button type="button" onClick={onEnd} className="ml-auto text-muted hover:text-danger text-xs whitespace-nowrap">End interview</button>
      </div>
      <div className="h-[3px] bg-line" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
        <div className="h-full bg-accent transition-[width] duration-500" style={{ width: `${progress * 100}%` }} />
      </div>
    </header>
  );
}
