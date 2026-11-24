"use client";
import { Card } from "@/components/ui";

export interface Bar { label: string; value: number | null; title?: string }

/**
 * Vertical bar chart. Missing values are shown as "n/a" (no bar), never as zero,
 * and the chart states how many items have data.
 */
export function BarChart({ title, description, bars, max, unit = "", format = (v) => String(v), tone = "gold" }: {
  title: string; description?: string; bars: Bar[]; max?: number; unit?: string; format?: (v: number) => string; tone?: "gold" | "ink" | "muted";
}) {
  const withData = bars.filter((b) => b.value != null);
  const top = max ?? Math.max(1, ...withData.map((b) => b.value!));
  const fill = tone === "gold" ? "url(#bar-gold)" : tone === "ink" ? "var(--ink-2)" : "var(--line-strong)";
  const H = 150, W = Math.max(280, bars.length * 44), bw = Math.min(28, (W / bars.length) * 0.55);
  return (
    <Card className="p-4 sm:p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="font-display text-[15px] font-semibold">{title}</h3>
        <span className="text-[11px] text-muted whitespace-nowrap">{withData.length} of {bars.length} with data</span>
      </div>
      {description && <p className="mt-0.5 text-xs text-muted">{description}</p>}
      {withData.length === 0 ? (
        <p className="mt-6 mb-4 text-center text-sm text-muted">No data yet.</p>
      ) : (
        <div className="mt-3 overflow-x-auto no-scrollbar">
          <svg viewBox={`0 0 ${W} ${H + 34}`} className="w-full min-w-[280px]" role="img" aria-label={`${title}: ${bars.map((b) => `${b.label} ${b.value == null ? "not available" : format(b.value) + unit}`).join(", ")}`}>
            <defs>
              <linearGradient id="bar-gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#e8c972" /><stop offset="100%" stopColor="#c8961e" /></linearGradient>
            </defs>
            {[0.25, 0.5, 0.75, 1].map((g) => <line key={g} x1={0} x2={W} y1={H - g * H + 14} y2={H - g * H + 14} stroke="var(--line)" strokeDasharray="3 4" />)}
            <line x1={0} x2={W} y1={H + 14} y2={H + 14} stroke="var(--line-strong)" />
            {bars.map((b, i) => {
              const cx = (i + 0.5) * (W / bars.length);
              const h = b.value == null ? 0 : Math.max(2, (Math.min(b.value, top) / top) * H);
              return (
                <g key={i}>
                  <title>{b.title ?? `${b.label}: ${b.value == null ? "not available" : format(b.value) + unit}`}</title>
                  {b.value != null && <rect x={cx - bw / 2} y={H + 14 - h} width={bw} height={h} rx={5} fill={fill} />}
                  <text x={cx} y={b.value == null ? H + 6 : H + 8 - h} textAnchor="middle" fontSize="11" fill={b.value == null ? "var(--muted)" : "var(--ink)"} fontWeight={600}>
                    {b.value == null ? "n/a" : format(b.value)}
                  </text>
                  <text x={cx} y={H + 30} textAnchor="middle" fontSize="11" fill="var(--muted)">{b.label}</text>
                </g>
              );
            })}
          </svg>
        </div>
      )}
    </Card>
  );
}

/** Horizontal bars for average scores by category (0–100). */
export function CategoryChart({ title, rows }: { title: string; rows: Array<{ label: string; value: number | null; n: number }> }) {
  const any = rows.some((r) => r.value != null);
  return (
    <Card className="p-4 sm:p-5">
      <h3 className="font-display text-[15px] font-semibold">{title}</h3>
      <p className="mt-0.5 text-xs text-muted">Average practice score across analysed answers (0–100).</p>
      {!any ? <p className="mt-6 mb-4 text-center text-sm text-muted">No analysed answers yet.</p> : (
        <ul className="mt-4 grid gap-3">
          {rows.map((r) => (
            <li key={r.label} className="grid grid-cols-[96px_1fr_auto] items-center gap-3 text-sm">
              <span className="text-ink-2">{r.label}</span>
              <span className="h-2.5 rounded-full bg-surface-3 overflow-hidden" role="img" aria-label={`${r.label}: ${r.value ?? "not assessed"}`}>
                {r.value != null && <span className="block h-full rounded-full bg-gold-gradient" style={{ width: `${r.value}%` }} />}
              </span>
              <span className="w-24 text-right tabular-nums text-xs">{r.value == null ? <span className="text-muted">Not assessed</span> : <><b className="text-ink">{r.value}</b><span className="text-muted"> · {r.n} ans.</span></>}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
