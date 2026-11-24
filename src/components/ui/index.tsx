import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, XCircle, type LucideIcon } from "lucide-react";

export function cx(...c: Array<string | false | null | undefined>) {
  return c.filter(Boolean).join(" ");
}

/* ------------------------------------------------------------------ buttons */

type Variant = "primary" | "secondary" | "ghost" | "danger" | "dark";
type Size = "sm" | "md" | "lg";
const variants: Record<Variant, string> = {
  primary:
    "bg-gold-gradient text-accent-ink shadow-[var(--shadow-accent)] hover:brightness-105 active:translate-y-px",
  secondary: "bg-surface text-ink border border-line-strong hover:border-ink/25 hover:bg-surface-2 shadow-[0_1px_2px_rgb(22_22_26/0.04)]",
  ghost: "text-ink-2 hover:bg-surface-2 hover:text-ink",
  danger: "bg-surface text-danger border border-line-strong hover:bg-danger-soft hover:border-danger/40",
  dark: "bg-ink text-bg hover:opacity-90",
};
const sizes: Record<Size, string> = {
  sm: "h-9 px-3 text-[13px] rounded-lg gap-1.5",
  md: "h-11 px-4.5 text-sm rounded-xl gap-2",
  lg: "h-13 px-6 text-[15px] rounded-2xl gap-2.5",
};
const base =
  "inline-flex items-center justify-center font-medium transition-[background,color,border,box-shadow,transform,opacity] duration-150 disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap select-none [&_svg]:size-[1.1em] [&_svg]:shrink-0";

export function buttonClass(variant: Variant = "primary", size: Size = "md", className?: string) {
  return cx(base, variants[variant], sizes[size], className);
}

export function Button({ variant = "primary", size = "md", className, ...p }: ComponentProps<"button"> & { variant?: Variant; size?: Size }) {
  return <button className={buttonClass(variant, size, className)} {...p} />;
}

export function LinkButton({ variant = "primary", size = "md", className, ...p }: ComponentProps<typeof Link> & { variant?: Variant; size?: Size }) {
  return <Link className={buttonClass(variant, size, className)} {...p} />;
}

/* -------------------------------------------------------------------- cards */

export function Card({ className, ...p }: ComponentProps<"div">) {
  return <div className={cx("rounded-2xl bg-surface border border-line shadow-[var(--shadow-card)]", className)} {...p} />;
}

/** Card with a titled header row; the standard building block of admin pages. */
export function Section({ title, description, icon: Icon, actions, children, className, bodyClassName }: {
  title: ReactNode; description?: ReactNode; icon?: LucideIcon; actions?: ReactNode; children?: ReactNode; className?: string; bodyClassName?: string;
}) {
  return (
    <Card className={cx("overflow-hidden", className)}>
      <div className="flex flex-wrap items-start gap-3 px-5 sm:px-6 pt-5 pb-4">
        {Icon && <IconTile icon={Icon} />}
        <div className="min-w-0 flex-1">
          <h2 className="text-[17px] font-semibold text-ink leading-tight">{title}</h2>
          {description ? <p className="mt-1 text-sm text-muted">{description}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </div>
      {children ? <div className={cx("px-5 sm:px-6 pb-6", bodyClassName)}>{children}</div> : null}
    </Card>
  );
}

const tileTones = {
  accent: "bg-accent-soft text-accent-fg",
  gold: "bg-gold-soft text-gold-fg",
  ok: "bg-ok-soft text-ok",
  warn: "bg-warn-soft text-warn",
  danger: "bg-danger-soft text-danger",
  neutral: "bg-surface-2 text-ink-2",
  info: "bg-info-soft text-info",
} as const;
export type TileTone = keyof typeof tileTones;

export function IconTile({ icon: Icon, tone = "accent", size = "md" }: { icon: LucideIcon; tone?: TileTone; size?: "sm" | "md" | "lg" }) {
  const s = size === "sm" ? "h-8 w-8 rounded-lg [&_svg]:size-4" : size === "lg" ? "h-14 w-14 rounded-2xl [&_svg]:size-7" : "h-10 w-10 rounded-xl [&_svg]:size-5";
  return <span aria-hidden className={cx("grid shrink-0 place-items-center", s, tileTones[tone])}><Icon strokeWidth={1.8} /></span>;
}

export function StatCard({ label, value, icon, tone = "neutral", hint, active, onClick }: {
  label: string; value: ReactNode; icon: LucideIcon; tone?: TileTone; hint?: ReactNode; active?: boolean; onClick?: () => void;
}) {
  const inner = (
    <>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[13px] font-medium text-muted">{label}</p>
        <IconTile icon={icon} tone={tone} size="sm" />
      </div>
      <p className="mt-3 font-display text-[30px] leading-none font-semibold tabular-nums text-ink">{value}</p>
      {hint ? <p className="mt-2 text-xs text-muted truncate">{hint}</p> : null}
    </>
  );
  const cls = cx(
    "relative w-full text-left rounded-2xl bg-surface border p-4 sm:p-5 shadow-[var(--shadow-card)] transition",
    active ? "border-accent ring-4 ring-[var(--ring)]" : "border-line",
    onClick && "hover:border-line-strong hover:-translate-y-0.5 cursor-pointer",
  );
  return onClick ? <button type="button" onClick={onClick} aria-pressed={active} className={cls}>{inner}</button> : <div className={cls}>{inner}</div>;
}

/* ------------------------------------------------------------------- forms */

export function Field({ label, hint, children, className, optional }: { label: string; hint?: ReactNode; children: ReactNode; className?: string; optional?: boolean }) {
  return (
    <label className={cx("block space-y-1.5 min-w-0", className)}>
      <span className="flex items-baseline gap-1.5 text-[13px] font-medium text-ink">
        {label}{optional && <span className="text-xs font-normal text-muted">Optional</span>}
      </span>
      {children}
      {hint ? <span className="block text-xs text-muted leading-relaxed">{hint}</span> : null}
    </label>
  );
}

const inputCls =
  "w-full rounded-xl border border-line-strong bg-surface px-3.5 h-11 text-[15px] text-ink placeholder:text-muted/80 transition-[border,box-shadow] hover:border-ink/25 focus:border-accent focus:outline-none focus:ring-4 focus:ring-[var(--ring)] disabled:opacity-60";

export function Input({ className, ...p }: ComponentProps<"input">) {
  return <input className={cx(inputCls, className)} {...p} />;
}
export function Textarea({ className, ...p }: ComponentProps<"textarea">) {
  return <textarea className={cx(inputCls, "h-auto py-2.5 leading-relaxed", className)} {...p} />;
}
export function Select({ className, ...p }: ComponentProps<"select">) {
  return <select className={cx(inputCls, "app-select", className)} {...p} />;
}

export function Checkbox({ label, hint, ...p }: ComponentProps<"input"> & { label: string; hint?: string }) {
  return (
    <label className="flex items-start gap-3 cursor-pointer select-none">
      <input type="checkbox" className="peer sr-only" {...p} />
      <span className="mt-0.5 h-6 w-10 shrink-0 rounded-full bg-line-strong transition peer-checked:bg-accent relative after:absolute after:top-1 after:left-1 after:h-4 after:w-4 after:rounded-full after:bg-white after:shadow after:transition peer-checked:after:translate-x-4 peer-focus-visible:ring-4 peer-focus-visible:ring-[var(--ring)]" />
      <span className="text-sm">
        <span className="text-ink font-medium">{label}</span>
        {hint ? <span className="block text-xs text-muted mt-0.5">{hint}</span> : null}
      </span>
    </label>
  );
}

/**
 * Segmented control backed by real radio inputs, so it works inside a
 * <form> (FormData) as well as controlled.
 */
export function Segmented<T extends string>({ name, options, value, defaultValue, onChange, className, ariaLabel }: {
  name: string; options: Array<{ value: T; label: ReactNode }>; value?: T; defaultValue?: T; onChange?: (v: T) => void; className?: string; ariaLabel?: string;
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className={cx("inline-flex flex-wrap gap-1 rounded-xl bg-surface-2 p-1 border border-line", className)}>
      {options.map((o) => (
        <label key={o.value} className="relative">
          <input
            type="radio" name={name} value={o.value} className="peer sr-only"
            {...(value !== undefined ? { checked: value === o.value, onChange: () => onChange?.(o.value) } : { defaultChecked: defaultValue === o.value, onChange: () => onChange?.(o.value) })}
          />
          <span className="flex h-9 min-w-11 items-center justify-center rounded-lg px-3 text-[13px] font-medium text-ink-2 cursor-pointer transition hover:text-ink peer-checked:bg-surface peer-checked:text-ink peer-checked:shadow-[0_1px_3px_rgb(22_22_26/0.12)] peer-focus-visible:ring-4 peer-focus-visible:ring-[var(--ring)]">
            {o.label}
          </span>
        </label>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------ status / misc */

type Tone = "neutral" | "accent" | "ok" | "warn" | "danger" | "gold" | "info";
const tones: Record<Tone, string> = {
  neutral: "bg-surface-2 text-ink-2 border-line",
  accent: "bg-accent-soft text-accent-fg border-accent/15",
  ok: "bg-ok-soft text-ok border-ok/15",
  warn: "bg-warn-soft text-warn border-warn/20",
  danger: "bg-danger-soft text-danger border-danger/15",
  gold: "bg-gold-soft text-gold-fg border-gold/30",
  info: "bg-info-soft text-info border-info/15",
};
const dots: Record<Tone, string> = { neutral: "bg-muted", accent: "bg-accent", ok: "bg-ok", warn: "bg-warn", danger: "bg-danger", gold: "bg-gold", info: "bg-info" };

export function Badge({ tone = "neutral", children, className, dot = false }: { tone?: Tone; children: ReactNode; className?: string; dot?: boolean }) {
  return (
    <span className={cx("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap", tones[tone], className)}>
      {dot && <span aria-hidden className={cx("h-1.5 w-1.5 rounded-full", dots[tone])} />}
      {children}
    </span>
  );
}

const noticeIcon: Partial<Record<Tone, LucideIcon>> = { ok: CheckCircle2, warn: AlertTriangle, danger: XCircle, neutral: Info, accent: Info, info: Info, gold: AlertTriangle };

export function Notice({ tone = "neutral", title, children }: { tone?: Tone; title?: string; children?: ReactNode }) {
  const Icon = noticeIcon[tone] ?? Info;
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={cx("flex gap-3 rounded-xl border px-4 py-3 text-sm", tones[tone])}>
      <Icon aria-hidden className="mt-0.5 size-4 shrink-0" strokeWidth={2} />
      <div className="min-w-0">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? <div className={cx(title && "mt-0.5", "opacity-90 break-words")}>{children}</div> : null}
      </div>
    </div>
  );
}

export function ProgressBar({ value, className, tone = "accent", label }: { value: number; className?: string; tone?: "accent" | "ok" | "gold"; label?: string }) {
  const pct = Math.max(0, Math.min(100, value));
  const fill = tone === "ok" ? "bg-ok" : tone === "gold" ? "bg-gold" : "bg-accent";
  return (
    <div className={cx("h-1.5 rounded-full bg-surface-3 overflow-hidden", className)} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}>
      <div className={cx("h-full rounded-full transition-[width] duration-500", fill)} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function PageHeader({ title, description, actions, eyebrow }: { title: string; description?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4 mb-7 animate-rise">
      <div className="min-w-0 flex-1 basis-[22rem]">
        {eyebrow ? <p className="mb-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-accent-fg">{eyebrow}</p> : null}
        <h1 className="text-[26px] sm:text-[30px] font-semibold tracking-tight text-ink leading-tight">{title}</h1>
        {description ? <div className="mt-1.5 text-[15px] text-muted max-w-2xl">{description}</div> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2 shrink-0">{actions}</div> : null}
    </div>
  );
}

export function EmptyState({ title, children, action, icon: Icon }: { title: string; children?: ReactNode; action?: ReactNode; icon?: LucideIcon }) {
  return (
    <div className="rounded-2xl border border-dashed border-line-strong bg-surface/60 px-6 py-14 text-center">
      {Icon && <div className="mx-auto mb-4 w-fit"><IconTile icon={Icon} tone="neutral" size="lg" /></div>}
      <p className="font-display text-lg font-semibold text-ink">{title}</p>
      {children ? <p className="mt-1.5 text-sm text-muted max-w-md mx-auto">{children}</p> : null}
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}

export function FlashBar({ flash }: { flash: { tone: "ok" | "danger" | "warn"; text: string } | null }) {
  if (!flash) return null;
  return <div className="mb-6 animate-rise"><Notice tone={flash.tone}>{flash.text}</Notice></div>;
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cx("skeleton rounded-xl", className)} />;
}

export function Loading({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="py-10" role="status" aria-live="polite">
      <span className="sr-only">{label}</span>
      <div className="grid gap-4">
        <Skeleton className="h-8 w-56" />
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4"><Skeleton className="h-24" /><Skeleton className="h-24" /><Skeleton className="h-24" /><Skeleton className="h-24" /></div>
        <Skeleton className="h-48" />
      </div>
      <p className="mt-4 text-center text-sm text-muted">{label}</p>
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <span aria-hidden className={cx("inline-block size-4 rounded-full border-2 border-current border-r-transparent animate-spin", className)} />;
}

export function LoadError({ error, onRetry }: { error: string; onRetry?: () => void }) {
  return (
    <div className="py-6 max-w-xl">
      <Notice tone="danger" title="Could not load this page">{error}</Notice>
      {onRetry && <Button variant="secondary" size="sm" onClick={onRetry} className="mt-3">Try again</Button>}
    </div>
  );
}

/** Definition list row used in summaries. */
export function KeyValue({ items, className }: { items: Array<[ReactNode, ReactNode]>; className?: string }) {
  return (
    <dl className={cx("divide-y divide-line rounded-xl border border-line text-sm", className)}>
      {items.map(([k, v], i) => (
        <div key={i} className="flex justify-between gap-4 px-4 py-3">
          <dt className="text-muted">{k}</dt>
          <dd className="font-medium text-ink text-right min-w-0 break-words">{v}</dd>
        </div>
      ))}
    </dl>
  );
}
