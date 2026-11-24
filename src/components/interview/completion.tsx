"use client";
import { Check, Clock3, GraduationCap, ListChecks, School } from "lucide-react";
import { Button, Card, Notice } from "@/components/ui";
import { SterlingLogo } from "@/components/brand-mark";
import { formatDuration } from "@/lib/format";

export interface CompletionData {
  questionsCompleted: number;
  questionCount: number;
  durationSeconds: number;
  saved: "saving" | "saved" | "failed" | "preview";
}

/** Summary only. No scores or feedback: answers were never captured or analysed. */
export function Completion({ data, universityName, courseName, onDone, onAgain, onRetrySave }: {
  data: CompletionData;
  universityName: string;
  courseName: string;
  onDone: () => void;
  onAgain?: () => void;
  onRetrySave: () => void;
}) {
  const full = data.questionsCompleted === data.questionCount;
  const stats = [
    { icon: ListChecks, label: "Questions completed", value: `${data.questionsCompleted} of ${data.questionCount}` },
    { icon: Clock3, label: "Session duration", value: formatDuration(data.durationSeconds) },
  ];
  return (
    <div className="min-h-dvh brand-backdrop flex flex-col pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
      <header className="px-4 sm:px-6 py-5 mx-auto w-full max-w-xl flex justify-center"><SterlingLogo width={150} /></header>
      <main className="flex-1 grid place-items-center px-4 pb-12">
        <Card className="w-full max-w-xl overflow-hidden animate-rise">
          <div className="brand-rule" />
          <div className="p-6 sm:p-9 text-center">
            <div aria-hidden className="relative mx-auto h-20 w-20">
              <span className="absolute inset-0 rounded-full bg-gold-gradient opacity-25 animate-pulse-ring" />
              <span className="absolute inset-2 grid place-items-center rounded-full bg-gold-gradient text-[#17150f] shadow-[var(--shadow-accent)]"><Check className="size-8" strokeWidth={2.6} /></span>
            </div>
            <p className="mt-6 text-xs font-semibold uppercase tracking-[0.18em] text-accent-fg">{full ? "Interview completed" : "Interview ended"}</p>
            <h1 className="mt-2 text-[28px] sm:text-[34px] font-semibold tracking-tight leading-tight">{full ? "Congratulations!" : "Well done for practising"}</h1>
            <p className="mt-2 text-muted">{full ? "You have completed your mock interview." : "You completed part of your mock interview."}</p>

            <div className="mt-7 rounded-2xl border border-line bg-surface-2/60 p-4 text-left grid gap-3">
              <div className="flex items-start gap-3"><GraduationCap aria-hidden className="mt-0.5 size-5 text-accent-fg" /><div className="min-w-0"><p className="text-xs text-muted">Course</p><p className="font-medium text-ink">{courseName}</p></div></div>
              <div className="flex items-start gap-3"><School aria-hidden className="mt-0.5 size-5 text-accent-fg" /><div className="min-w-0"><p className="text-xs text-muted">University</p><p className="font-medium text-ink">{universityName}</p></div></div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3">
              {stats.map((s) => (
                <div key={s.label} className="rounded-2xl border border-line p-4 text-left">
                  <s.icon aria-hidden className="size-4 text-muted" />
                  <p className="mt-2 font-display text-xl font-semibold tabular-nums">{s.value}</p>
                  <p className="text-xs text-muted">{s.label}</p>
                </div>
              ))}
            </div>

            <p className="mt-5 text-xs text-muted">Your camera and microphone have been turned off. Nothing was recorded. Your adviser can see that you completed the interview.</p>
            {data.saved === "saving" && <p className="mt-3 text-xs text-muted">Saving session summary…</p>}
            {data.saved === "preview" && <div className="mt-4 text-left"><Notice tone="warn">Preview mode: nothing was saved.</Notice></div>}
            {data.saved === "failed" && (
              <div className="mt-4 grid gap-2 text-left">
                <Notice tone="warn">We could not save the session summary. Check your connection.</Notice>
                <Button variant="secondary" onClick={onRetrySave}>Try saving again</Button>
              </div>
            )}
            <div className="mt-7 flex flex-col sm:flex-row gap-3 justify-center">
              <Button size="lg" className="sm:min-w-40" onClick={onDone}>Done</Button>
              {onAgain && <Button size="lg" variant="secondary" onClick={onAgain}>Practice again</Button>}
            </div>
          </div>
        </Card>
      </main>
    </div>
  );
}
