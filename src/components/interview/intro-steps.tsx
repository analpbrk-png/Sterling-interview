"use client";
import { useEffect, useState } from "react";
import { Button, Card, Checkbox, IconTile, Notice } from "@/components/ui";
import { ArrowRight, BadgeCheck, BookOpen, Camera, ClipboardList, IdCard, Lightbulb, Mic, ScrollText, ShieldCheck, type LucideIcon } from "lucide-react";
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
  /** True when the student agreed to audio recording of answers. */
  recording?: boolean;
}

function Shell({ title, eyebrow, children, footer, icon: Icon }: { title: string; eyebrow: string; children: React.ReactNode; footer: React.ReactNode; icon?: LucideIcon }) {
  return (
    <div className="brand-backdrop min-h-[calc(100dvh-68px)]">
      <div key={title} className="mx-auto w-full max-w-3xl px-4 sm:px-6 py-8 sm:py-12 flex flex-col gap-7 min-h-[calc(100dvh-68px)] animate-rise">
        <div className="flex items-start gap-4">
          {Icon && <span className="hidden sm:block"><IconTile icon={Icon} tone="accent" size="lg" /></span>}
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent-fg">{eyebrow}</p>
            <h1 className="mt-2 text-[26px] sm:text-[32px] font-semibold tracking-tight text-ink leading-tight text-balance">{title}</h1>
          </div>
        </div>
        <div className="flex-1">{children}</div>
        <div className="sticky bottom-0 -mx-4 sm:mx-0 px-4 sm:px-0 py-3 sm:py-0 bg-bg/85 sm:bg-transparent backdrop-blur sm:backdrop-blur-none border-t border-line sm:border-0 flex flex-col-reverse sm:flex-row gap-3 sm:justify-end pb-[max(0.75rem,env(safe-area-inset-bottom))]">{footer}</div>
      </div>
    </div>
  );
}

export function IntroScreen(p: IntroProps) {
  const eyebrow = `Introduction · ${p.stepIndex + 1} of ${p.stepCount}`;
  const last = p.stepIndex === p.stepCount - 1;
  const nextLabel = last ? "Begin interview" : "Continue";
  const next = (variant: "primary" | "secondary" = "primary", label = nextLabel) => <Button size="lg" variant={variant} onClick={p.onNext}>{label} <ArrowRight /></Button>;
  const back = p.stepIndex > 0 ? <Button size="lg" variant="ghost" onClick={p.onBack}>Back</Button> : null;

  if (p.step === "welcome") {
    return (
      <Shell icon={ClipboardList} eyebrow={eyebrow} title="Before you begin" footer={next()}>
        <div className="grid gap-5 text-[15px] text-ink-2 leading-relaxed">
          <Card className="p-5 sm:p-6 grid sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2 min-w-0">
              <p className="text-xs font-medium uppercase tracking-wider text-muted">Practising for</p>
              <p className="mt-1.5 font-display text-xl font-semibold text-ink">{p.courseName}</p>
              <p className="text-ink-2">{p.universityName}</p>
            </div>
            <div className="sm:border-l sm:border-line sm:pl-5">
              <p className="text-xs font-medium uppercase tracking-wider text-muted">Questions</p>
              <p className="mt-1.5 font-display text-3xl font-semibold text-ink tabular-nums">{p.questionCount}</p>
              <p className="text-xs text-muted">one at a time</p>
            </div>
          </Card>
          <p>{p.prepSummary} When the answer timer starts, speak your answer out loud as if the interviewer were listening.</p>
          <ul className="grid gap-3 sm:grid-cols-3">
            {([[Lightbulb, "Find a quiet, well-lit place and keep this tab open."], [ShieldCheck, p.recording ? "Only the audio of your answers is recorded, while each answer timer runs. Your camera is never recorded." : "Camera and microphone are used live on your device only. Nothing is recorded or stored."], [BadgeCheck, p.recording ? "This is practice, not an official interview. Any feedback comes later from your adviser." : "This is practice, not an official interview. Nothing is assessed or scored."]] as const).map(([I, t]) => (
              <li key={t} className="rounded-2xl border border-line bg-surface p-4 text-sm"><I aria-hidden className="size-5 text-accent-fg mb-2" strokeWidth={1.8} />{t}</li>
            ))}
          </ul>
          {p.speech.supported && (
            <Card className="p-4"><Checkbox label="Read questions aloud" hint="Uses your browser's voice. You can mute it at any time." checked={p.speech.enabled} onChange={(e) => p.speech.setEnabled(e.target.checked)} /></Card>
          )}
          {p.generationNotice && <Notice tone="warn">{p.generationNotice}</Notice>}
          {p.config.includesSensitive && (
            <Notice tone="neutral" title="About some questions">
              This practice set may include questions that real interviews sometimes ask about visa history, dependants or health. Answer only what you are comfortable saying aloud{p.recording ? "" : "; nothing is recorded"}.
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
        icon={Camera}
        eyebrow={eyebrow}
        title="Camera and microphone check"
        footer={<>{back}{ready ? next() : next("secondary", "Continue without devices")}</>}
      >
        <div className="grid gap-5 sm:grid-cols-[1.4fr_1fr] items-start">
          <CameraPreview stream={p.media.stream} className="aspect-video w-full" />
          <div className="grid gap-4">
            {!ready && (
              <Button size="lg" onClick={p.media.request} disabled={p.media.status === "requesting"}><Camera />
                {p.media.status === "requesting" ? "Waiting for permission…" : "Allow camera and microphone"}
              </Button>
            )}
            <div className="grid gap-2.5 rounded-2xl border border-line bg-surface p-4">
              <DeviceRow icon={Camera} label="Camera" ok={ready && !!p.media.stream?.getVideoTracks().length} />
              <DeviceRow icon={Mic} label="Microphone" ok={ready && !!p.media.stream?.getAudioTracks().length} />
              <div className="pt-1"><MicMeter level={p.media.level} active={ready && !!p.media.stream?.getAudioTracks().length} /></div>
            </div>
            {ready && <p className="text-sm text-muted">Say a few words. The bars should move when you speak.</p>}
            {p.media.error && <Notice tone="danger">{p.media.error}</Notice>}
            <p className="text-xs text-muted">{p.recording ? "Your camera is a live preview only and is never recorded. The microphone is needed to record your answers." : "We only show a live preview. No video, audio or snapshots are captured, saved or uploaded."}</p>
          </div>
        </div>
      </Shell>
    );
  }

  if (p.step === "passport") return <PassportStep {...p} eyebrow={eyebrow} nextLabel={nextLabel} back={back} />;

  if (p.step === "name_id") {
    return (
      <Shell icon={IdCard} eyebrow={eyebrow} title="Look at the camera and clearly state your full name and student ID." footer={<>{back}{next()}</>}>
        <div className="grid gap-5 sm:grid-cols-[1.4fr_1fr] items-start">
          <CameraPreview stream={p.media.stream} className="aspect-video w-full" />
          <div className="grid gap-4">
            {p.identity ? (
              <dl className="rounded-2xl border border-line bg-surface p-5 grid gap-4">
                <div><dt className="text-xs uppercase tracking-wider text-muted">Full name</dt><dd className="mt-1 font-display text-2xl font-semibold text-ink break-words">{p.identity.fullName}</dd></div>
                <div><dt className="text-xs uppercase tracking-wider text-muted">Student ID</dt><dd className="mt-1 font-display text-2xl font-semibold text-ink tabular-nums break-all">{p.identity.studentId}</dd></div>
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
      <Shell icon={BookOpen} eyebrow={eyebrow} title="Read the following words clearly and out loud." footer={<>{back}{next()}</>}>
        <div className="grid gap-6">
          <p className="rounded-3xl bg-surface border border-line px-6 py-10 text-center font-display text-[28px] sm:text-[40px] font-semibold tracking-tight text-ink leading-snug shadow-[var(--shadow-card)]">
            {p.config.pronunciationWords.join(", ")}
          </p>
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <MicMeter level={p.media.level} active={!!p.media.stream?.getAudioTracks().length} />
            <CameraPreview stream={p.media.stream} className="w-36 aspect-video" />
          </div>
          <p className="text-xs text-muted">Pronunciation practice only. This step is not recorded.</p>
        </div>
      </Shell>
    );
  }

  // declaration
  return (
    <Shell icon={ScrollText} eyebrow={eyebrow} title="Read the statement aloud." footer={<>{back}{next()}</>}>
      <div className="grid gap-5">
        <blockquote className="relative rounded-3xl bg-surface border border-line p-6 sm:p-8 pl-8 sm:pl-10 text-lg sm:text-xl leading-relaxed text-ink shadow-[var(--shadow-card)] before:absolute before:left-0 before:top-6 before:bottom-6 before:w-1 before:rounded-r-full before:bg-[image:var(--gold-gradient)]">{p.config.declarationText}</blockquote>
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
    <Shell icon={IdCard} eyebrow={p.eyebrow} title="Passport presentation practice" footer={<>{p.back}{phase === 0 ? <Button size="lg" onClick={() => setPhase(1)}>Next instruction <ArrowRight /></Button> : <Button size="lg" onClick={p.onNext}>{p.nextLabel} <ArrowRight /></Button>}</>}>
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
            <li className={"flex gap-3 rounded-2xl border p-4 transition " + (phase === 0 ? "border-accent/40 bg-accent-soft text-ink font-medium" : "border-line bg-surface text-muted")}><span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-gold-gradient text-sm font-semibold text-[#17150f]">1</span>Open your passport to the page with your photo.</li>
            {phase === 1 && (
              <li className="flex gap-3 rounded-2xl border border-accent/40 bg-accent-soft p-4 text-ink font-medium animate-rise"><span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-gold-gradient text-sm font-semibold text-[#17150f]">2</span>Hold the passport in front of your face for 3 seconds, then move it next to your face, no more than 20 cm away.</li>
            )}
          </ol>
          {phase === 1 && (
            <Button size="lg" variant="secondary" onClick={() => setHold(3)} disabled={hold !== null && hold > 0}>Start 3-second hold</Button>
          )}
          <p className="text-xs text-muted">Practice only. Nothing is captured, checked or verified, and no image of your passport is taken.</p>
          {!p.media.stream && <Notice tone="warn">Camera is off. You can still read the instructions and practise the movement.</Notice>}
        </div>
      </div>
    </Shell>
  );
}

function DeviceRow({ icon: Icon, label, ok }: { icon: LucideIcon; label: string; ok: boolean }) {
  return (
    <div className="flex items-center gap-3 text-sm">
      <Icon aria-hidden className="size-4 text-muted" />
      <span className="text-ink">{label}</span>
      <span className={"ml-auto inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium " + (ok ? "bg-ok-soft text-ok" : "bg-surface-2 text-muted")}>
        <span aria-hidden className={"h-1.5 w-1.5 rounded-full " + (ok ? "bg-ok" : "bg-muted")} />{ok ? "Ready" : "Not connected"}
      </span>
    </div>
  );
}
