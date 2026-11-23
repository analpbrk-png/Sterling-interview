"use client";
import { useEffect, useState } from "react";
import { Button, Checkbox, Notice } from "@/components/ui";
import type { IntroStep } from "@/lib/interview/machine";
import type { SessionConfig } from "@/lib/interview/config";
import type { MediaStatus } from "@/hooks/use-media";
import { CameraPreview, MicMeter } from "./media-bits";

export interface IntroProps {
  step: IntroStep;
  stepIndex: number;
  stepCount: number;
  config: SessionConfig;
  universityName: string;
  courseName: string;
  questionCount: number;
  prepSummary: string;
  generationNotice: string | null;
  identity: { fullName: string; studentId: string } | null;
  media: { stream: MediaStream | null; status: MediaStatus; error: string | null; level: number; request: () => void };
  speech: { supported: boolean; enabled: boolean; setEnabled: (v: boolean) => void };
  onNext: () => void;
  onBack: () => void;
}

function Shell({ title, eyebrow, children, footer }: { title: string; eyebrow: string; children: React.ReactNode; footer: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 sm:px-6 py-8 sm:py-14 flex flex-col gap-8 min-h-[calc(100dvh-64px)]">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">{eyebrow}</p>
        <h1 className="mt-2 text-2xl sm:text-3xl font-semibold tracking-tight text-ink">{title}</h1>
      </div>
      <div className="flex-1">{children}</div>
      <div className="flex flex-col-reverse sm:flex-row gap-3 sm:justify-end pb-[env(safe-area-inset-bottom)]">{footer}</div>
    </div>
  );
}

export function IntroScreen(p: IntroProps) {
  const eyebrow = `Introduction · ${p.stepIndex + 1} of ${p.stepCount}`;
  const last = p.stepIndex === p.stepCount - 1;
  const nextLabel = last ? "Begin interview" : "Continue";
  const back = p.stepIndex > 0 ? <Button variant="ghost" onClick={p.onBack}>Back</Button> : null;

  if (p.step === "welcome") {
    return (
      <Shell eyebrow={eyebrow} title="Welcome to your AI Mock Interview." footer={<Button onClick={p.onNext}>{nextLabel}</Button>}>
        <div className="grid gap-5 text-[15px] text-ink-2 leading-relaxed">
          <div className="rounded-2xl border border-line bg-surface p-5">
            <p className="text-sm text-muted">Practising for</p>
            <p className="mt-1 text-lg font-semibold text-ink">{p.courseName}</p>
            <p className="text-ink-2">{p.universityName}</p>
          </div>
          <p>
            You will see <strong>{p.questionCount} questions, one at a time</strong>. {p.prepSummary} When the answer timer
            starts, speak your answer out loud as if the interviewer were listening.
          </p>
          <ul className="grid gap-2 text-sm">
            <li>• Find a quiet, well-lit place and keep this tab open.</li>
            <li>• Your camera and microphone are used live on your device only. <strong>Nothing is recorded or stored.</strong></li>
            <li>• This is practice, not an official interview, and nothing is assessed or scored.</li>
          </ul>
          {p.speech.supported && (
            <Checkbox label="Read questions aloud" hint="Uses your browser's voice. You can mute it at any time." checked={p.speech.enabled} onChange={(e) => p.speech.setEnabled(e.target.checked)} />
          )}
          {p.generationNotice && <Notice tone="warn">{p.generationNotice}</Notice>}
          {p.config.includesSensitive && (
            <Notice tone="neutral" title="About some questions">
              This practice set may include questions that real interviews sometimes ask about visa history, dependants or health. Answer only what you are comfortable saying aloud; nothing is recorded.
            </Notice>
          )}
        </div>
      </Shell>
    );
  }

  if (p.step === "media") {
    const ready = p.media.status === "ready";
    return (
      <Shell
        eyebrow={eyebrow}
        title="Camera and microphone check"
        footer={<>{back}{ready ? <Button onClick={p.onNext}>{nextLabel}</Button> : <Button variant="secondary" onClick={p.onNext}>Continue without devices</Button>}</>}
      >
        <div className="grid gap-5 sm:grid-cols-[1.4fr_1fr] items-start">
          <CameraPreview stream={p.media.stream} className="aspect-video w-full" />
          <div className="grid gap-4">
            {!ready && (
              <Button onClick={p.media.request} disabled={p.media.status === "requesting"}>
                {p.media.status === "requesting" ? "Waiting for permission…" : "Allow camera and microphone"}
              </Button>
            )}
            <MicMeter level={p.media.level} active={ready && !!p.media.stream?.getAudioTracks().length} />
            {ready && <p className="text-sm text-muted">Say a few words. The bars should move when you speak.</p>}
            {p.media.error && <Notice tone="danger">{p.media.error}</Notice>}
            <p className="text-xs text-muted">We only show a live preview. No video, audio or snapshots are captured, saved or uploaded.</p>
          </div>
        </div>
      </Shell>
    );
  }

  if (p.step === "passport") return <PassportStep {...p} eyebrow={eyebrow} nextLabel={nextLabel} back={back} />;

  if (p.step === "name_id") {
    return (
      <Shell eyebrow={eyebrow} title="Please look at the camera and clearly state your full name and student ID." footer={<>{back}<Button onClick={p.onNext}>{nextLabel}</Button></>}>
        <div className="grid gap-5 sm:grid-cols-[1.4fr_1fr] items-start">
          <CameraPreview stream={p.media.stream} className="aspect-video w-full" />
          <div className="grid gap-4">
            {p.identity ? (
              <dl className="rounded-2xl border border-line bg-surface p-4 text-sm grid gap-2">
                <div><dt className="text-muted">Full name</dt><dd className="font-medium text-ink">{p.identity.fullName}</dd></div>
                <div><dt className="text-muted">Student ID</dt><dd className="font-medium text-ink">{p.identity.studentId}</dd></div>
              </dl>
            ) : (
              <Notice>State your full name and the student ID from your offer letter.</Notice>
            )}
            <MicMeter level={p.media.level} active={!!p.media.stream?.getAudioTracks().length} />
          </div>
        </div>
      </Shell>
    );
  }

  if (p.step === "pronunciation") {
    return (
      <Shell eyebrow={eyebrow} title="Read the following words clearly and out loud." footer={<>{back}<Button onClick={p.onNext}>{nextLabel}</Button></>}>
        <div className="grid gap-6">
          <p className="rounded-2xl bg-surface border border-line px-6 py-8 text-center text-2xl sm:text-3xl font-semibold tracking-tight text-ink">
            {p.config.pronunciationWords.join(", ")}
          </p>
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <MicMeter level={p.media.level} active={!!p.media.stream?.getAudioTracks().length} />
            <CameraPreview stream={p.media.stream} className="w-36 aspect-video" />
          </div>
          <p className="text-xs text-muted">Pronunciation practice only. Your voice is not analysed or stored.</p>
        </div>
      </Shell>
    );
  }

  // declaration
  return (
    <Shell eyebrow={eyebrow} title="Read the statement aloud." footer={<>{back}<Button onClick={p.onNext}>{nextLabel}</Button></>}>
      <div className="grid gap-5">
        <blockquote className="rounded-2xl bg-surface border border-line p-6 text-lg sm:text-xl leading-relaxed text-ink">{p.config.declarationText}</blockquote>
        <Notice>This is a practice simulation of the declaration real interviews use. It is not a legally binding declaration to any university.</Notice>
        <MicMeter level={p.media.level} active={!!p.media.stream?.getAudioTracks().length} />
      </div>
    </Shell>
  );
}

function PassportStep(p: IntroProps & { eyebrow: string; nextLabel: string; back: React.ReactNode }) {
  const [phase, setPhase] = useState<0 | 1>(0);
  const [hold, setHold] = useState<number | null>(null);
  useEffect(() => {
    if (hold === null || hold <= 0) return;
    const id = window.setTimeout(() => setHold((h) => (h ?? 1) - 1), 1000);
    return () => window.clearTimeout(id);
  }, [hold]);
  return (
    <Shell eyebrow={p.eyebrow} title="Passport presentation practice" footer={<>{p.back}{phase === 0 ? <Button onClick={() => setPhase(1)}>Next instruction</Button> : <Button onClick={p.onNext}>{p.nextLabel}</Button>}</>}>
      <div className="grid gap-5 sm:grid-cols-[1.4fr_1fr] items-start">
        <div className="relative">
          <CameraPreview stream={p.media.stream} className="aspect-video w-full" />
          {hold !== null && (
            <div className="absolute inset-0 grid place-items-center">
              <span className="rounded-full bg-black/55 text-white text-4xl font-semibold w-20 h-20 grid place-items-center tabular-nums">{hold > 0 ? hold : "✓"}</span>
            </div>
          )}
        </div>
        <div className="grid gap-4">
          <ol className="grid gap-3 text-[17px] leading-snug">
            <li className={phase === 0 ? "text-ink font-medium" : "text-muted"}>1. Open your passport to the page with your photo.</li>
            {phase === 1 && (
              <li className="text-ink font-medium">2. Hold the passport in front of your face for 3 seconds, then move it next to your face, no more than 20 cm away.</li>
            )}
          </ol>
          {phase === 1 && (
            <Button variant="secondary" onClick={() => setHold(3)} disabled={hold !== null && hold > 0}>Start 3-second hold</Button>
          )}
          <p className="text-xs text-muted">Practice only. Nothing is captured, checked or verified, and no image of your passport is taken.</p>
          {!p.media.stream && <Notice tone="warn">Camera is off. You can still read the instructions and practise the movement.</Notice>}
        </div>
      </div>
    </Shell>
  );
}
