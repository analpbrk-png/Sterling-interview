"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Ban, Copy, Eye, ListOrdered, MoreHorizontal, RefreshCw, RotateCcw } from "lucide-react";
import { Button, cx } from "@/components/ui";
import { allowRetry, copyToClipboard, getInvitationLink, regenerateInvitation, revokeInvitation } from "@/lib/admin/ops";
import type { ProgressRow } from "@/lib/admin/progress";

type Run = (fn: () => Promise<string | void>) => Promise<void>;

function rules(row: ProgressRow) {
  const revoked = !!row.revoked_at;
  const noAttempts = row.attempts_used >= row.max_attempts && !(row.session_status === "ready" || row.session_status === "in_progress");
  const retryDisabled = !noAttempts && new Date(row.expires_at).getTime() > Date.now();
  return { revoked, retryDisabled };
}

function actions(row: ProgressRow, run: Run) {
  return {
    copy: () => void run(async () => { await copyToClipboard(await getInvitationLink(row.id)); return `Link for ${row.student_name} copied.`; }),
    revoke: () => window.confirm(`Revoke ${row.student_name}'s link? It will stop working immediately.`) && void run(async () => { await revokeInvitation(row.id); return "Link revoked."; }),
    regenerate: () => window.confirm("Create a new link? The old link stops working.") && void run(async () => { const url = await regenerateInvitation(row.id); await copyToClipboard(url); return "New link created and copied. The old link no longer works."; }),
    retry: () => void run(async () => { await allowRetry(row.id); return `${row.student_name} can take the interview again.`; }),
  };
}

/** Copy / revoke / regenerate / retry as buttons (student record page). */
export function LinkActions({ row, run, busy, compact = false }: { row: ProgressRow; run: Run; busy: boolean; compact?: boolean }) {
  const { revoked, retryDisabled } = rules(row);
  const a = actions(row, run);
  const size = compact ? "sm" : "md";
  return (
    <>
      <Button size={size} variant="secondary" disabled={busy || revoked} title={revoked ? "Link revoked: regenerate to get a new one" : undefined} onClick={a.copy}><Copy /> Copy link</Button>
      <Button size={size} variant="ghost" disabled={busy || revoked} onClick={a.revoke}><Ban /> Revoke</Button>
      <Button size={size} variant="ghost" disabled={busy} onClick={a.regenerate}><RefreshCw /> Regenerate</Button>
      <Button size={size} variant="ghost" disabled={busy || retryDisabled} title="Give one more attempt (and reopen an expired link for 7 days)" onClick={a.retry}><RotateCcw /> Allow retry</Button>
    </>
  );
}

/** Compact contextual actions for list rows: copy link + a menu with everything else. */
export function RowActions({ row, run, busy, compact = false }: { row: ProgressRow; run: Run; busy: boolean; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [up, setUp] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { revoked, retryDisabled } = rules(row);
  const a = actions(row, run);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", close); };
  }, [open]);
  const item = "flex w-full items-center gap-2.5 rounded-lg px-3 h-9 text-[13px] text-ink-2 hover:bg-surface-2 hover:text-ink disabled:opacity-40 disabled:pointer-events-none [&_svg]:size-4 [&_svg]:text-muted";
  const pick = (fn: () => unknown) => () => { setOpen(false); fn(); };
  return (
    <div ref={ref} className="relative flex items-center justify-end gap-1.5">
      <Button size="sm" variant="secondary" disabled={busy || revoked} onClick={a.copy} title={revoked ? "Link revoked: regenerate to get a new one" : "Copy interview link"} aria-label={`Copy link for ${row.student_name}`}><Copy /> <span className={compact ? "hidden 2xl:inline" : ""}>Copy link</span></Button>
      <button type="button" aria-haspopup="menu" aria-expanded={open} aria-label={`More actions for ${row.student_name}`} onClick={(e) => { setUp(e.currentTarget.getBoundingClientRect().bottom > window.innerHeight - 260); setOpen((o) => !o); }}
        className={cx("grid h-9 w-9 place-items-center rounded-lg border border-line-strong bg-surface text-ink-2 hover:bg-surface-2", open && "bg-surface-2")}>
        <MoreHorizontal className="size-4" />
      </button>
      {open && (
        <div role="menu" className={cx("absolute right-0 z-20", up ? "bottom-11" : "top-11")} ><div className="w-56 rounded-xl border border-line bg-surface p-1.5 shadow-[var(--shadow-pop)] animate-fade">
          <Link role="menuitem" className={item} href={`/admin/invitations/view/?id=${row.id}`}><Eye /> View progress</Link>
          <Link role="menuitem" className={item} href={`/admin/invitations/view/?id=${row.id}#questions`}><ListOrdered /> View questions</Link>
          <div className="my-1 h-px bg-line" />
          <button role="menuitem" type="button" className={item} disabled={busy} onClick={pick(a.regenerate)}><RefreshCw /> Regenerate link</button>
          <button role="menuitem" type="button" className={item} disabled={busy || retryDisabled} onClick={pick(a.retry)}><RotateCcw /> Allow retry</button>
          <button role="menuitem" type="button" className={cx(item, "text-danger hover:text-danger [&_svg]:text-danger")} disabled={busy || revoked} onClick={pick(a.revoke)}><Ban /> Revoke link</button>
        </div></div>
      )}
    </div>
  );
}
