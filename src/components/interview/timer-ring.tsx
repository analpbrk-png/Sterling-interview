"use client";
import { cx } from "@/components/ui";
import { formatClock } from "@/lib/interview/machine";

export type TimerStage = "preparing" | "answering" | "awaiting_submit" | "transition";

const LABEL: Record<TimerStage, string> = {
  preparing: "Preparation time",
  answering: "Answer time",
  awaiting_submit: "Time is up",
  transition: "Next question",
};

/**
 * Circular countdown. `fraction` is the share of the stage still remaining
 * (1 → 0). Preparation uses the pale-gold track, answering the deep gold,
 * so the two stages look related but clearly different.
 */
export function TimerRing({ stage, remaining, fraction, size = 208 }: { stage: TimerStage; remaining: number | null; fraction: number; size?: number }) {
  const stroke = 10;
  const r = (size - stroke) / 2 - 4;
  const c = 2 * Math.PI * r;
  const f = Math.max(0, Math.min(1, fraction));
  const answering = stage === "answering";
  const urgent = answering && remaining != null && remaining <= 10;
  const gradId = `ring-${stage}`;
  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
            {answering || urgent
              ? <><stop offset="0%" stopColor="#f3dc8c" /><stop offset="55%" stopColor="#d6ad45" /><stop offset="100%" stopColor="#c8961e" /></>
              : <><stop offset="0%" stopColor="#fdf6c8" /><stop offset="100%" stopColor="#e8c972" /></>}
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-3)" strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={stage === "awaiting_submit" ? "var(--warn)" : `url(#${gradId})`} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - (stage === "awaiting_submit" ? 1 : f))}
          className="transition-[stroke-dashoffset] duration-300 ease-linear"
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center" role="timer" aria-live="off" aria-label={remaining != null ? `${LABEL[stage]}: ${remaining} seconds remaining` : LABEL[stage]}>
        <div>
          <p className={cx("text-[11px] font-semibold uppercase tracking-[0.18em]", answering ? "text-accent-fg" : stage === "awaiting_submit" ? "text-warn" : "text-muted")}>{LABEL[stage]}</p>
          <p className={cx("mt-1 font-display font-semibold tabular-nums leading-none", size < 180 ? "text-[38px]" : "text-[50px]", urgent ? "text-danger" : "text-ink")}>
            {stage === "transition" ? "··:··" : formatClock(remaining ?? 0)}
          </p>
        </div>
      </div>
    </div>
  );
}
