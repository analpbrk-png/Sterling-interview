"use client";
import { Button } from "@/components/ui";
import { allowRetry, copyToClipboard, getInvitationLink, regenerateInvitation, revokeInvitation } from "@/lib/admin/ops";
import type { ProgressRow } from "@/lib/admin/progress";

type Run = (fn: () => Promise<string | void>) => Promise<void>;

/** Copy / revoke / regenerate / retry, shared by the dashboard table and the student record. */
export function LinkActions({ row, run, busy, compact = false }: { row: ProgressRow; run: Run; busy: boolean; compact?: boolean }) {
  const cls = compact ? "h-8 px-2.5 text-xs" : "";
  const revoked = !!row.revoked_at;
  const noAttempts = row.attempts_used >= row.max_attempts && !(row.session_status === "ready" || row.session_status === "in_progress");
  return (
    <>
      <Button className={cls} variant="secondary" disabled={busy || revoked} title={revoked ? "Link revoked: regenerate to get a new one" : undefined}
        onClick={() => void run(async () => { await copyToClipboard(await getInvitationLink(row.id)); return `Link for ${row.student_name} copied.`; })}>Copy link</Button>
      <Button className={cls} variant="ghost" disabled={busy || revoked}
        onClick={() => window.confirm(`Revoke ${row.student_name}'s link? It will stop working immediately.`) && void run(async () => { await revokeInvitation(row.id); return "Link revoked."; })}>Revoke</Button>
      <Button className={cls} variant="ghost" disabled={busy}
        onClick={() => window.confirm("Create a new link? The old link stops working.") && void run(async () => { const url = await regenerateInvitation(row.id); await copyToClipboard(url); return "New link created and copied. The old link no longer works."; })}>Regenerate</Button>
      <Button className={cls} variant="ghost" disabled={busy || !noAttempts && new Date(row.expires_at).getTime() > Date.now()}
        title="Give one more attempt (and reopen an expired link for 7 days)"
        onClick={() => void run(async () => { await allowRetry(row.id); return `${row.student_name} can take the interview again.`; })}>Allow retry</Button>
    </>
  );
}
