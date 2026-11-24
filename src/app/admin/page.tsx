"use client";
import Link from "next/link";
import { useState } from "react";
import { Clock3, Mail, Plus, Radio, Sparkles } from "lucide-react";
import { STATUS_ICON, useProgressRows } from "@/components/admin/use-progress-rows";
import { useAction } from "@/lib/use-action";
import { useFlash } from "@/lib/flash";
import { useAiMode } from "@/components/admin/local-ai";
import { percent, stageLabel, STATUS_INFO, type InviteStatus } from "@/lib/admin/progress";
import { Avatar, InterviewsTable } from "@/components/admin/interviews-table";
import { Badge, Card, FlashBar, LinkButton, LoadError, Loading, PageHeader, ProgressBar, Section, StatCard } from "@/components/ui";

const STATUS_BAR: Record<InviteStatus, string> = { not_started: "bg-surface-3", in_progress: "bg-accent", completed: "bg-ok", interrupted: "bg-warn", expired: "bg-danger" };

export default function AdminDashboard() {
  const { mode } = useAiMode();
  const [pageFlash] = useFlash();
  const { run, busy, flash } = useAction();
  const [status, setStatus] = useState("");
  const { data: rows, error, loading, reload } = useProgressRows();
  if (loading && !rows) return <Loading />;
  if (error || !rows) return <LoadError error={error ?? "Not found"} onRetry={reload} />;

  const count = (s: InviteStatus) => rows.filter((r) => r.status === s).length;
  const live = rows.filter((r) => r.status === "in_progress");
  const started = rows.filter((r) => r.session_id);
  const completionRate = started.length ? Math.round((count("completed") / started.length) * 100) : 0;
  const answered = rows.reduce((a, r) => a + r.completed_questions, 0);

  return (
    <>
      <PageHeader
        eyebrow="Overview"
        title="Interview dashboard"
        description={<span className="inline-flex flex-wrap items-center gap-2">Live progress, updated automatically.
          <Link href="/admin/ai/"><Badge dot tone={mode.tone === "ok" ? "ok" : mode.tone === "danger" ? "danger" : "gold"}><Sparkles className="size-3" /> AI Mode: {mode.label}</Badge></Link></span>}
        actions={<LinkButton href="/admin/invitations/new/"><Plus /> New interview</LinkButton>}
      />
      <FlashBar flash={flash ?? pageFlash} />

      <div className="grid gap-3 sm:gap-4 grid-cols-2 md:grid-cols-3 2xl:grid-cols-6 mb-6 animate-rise">
        <StatCard label="Total invitations" value={rows.length} icon={Mail} tone="accent" active={status === ""} onClick={() => setStatus("")} hint="All interview links" />
        <StatCard label="Pending" value={count("not_started")} icon={STATUS_ICON.not_started} tone="neutral" active={status === "not_started"} onClick={() => setStatus("not_started")} hint="Not started yet" />
        <StatCard label="In progress" value={count("in_progress")} icon={STATUS_ICON.in_progress} tone="gold" active={status === "in_progress"} onClick={() => setStatus("in_progress")} hint="Answering now" />
        <StatCard label="Completed" value={count("completed")} icon={STATUS_ICON.completed} tone="ok" active={status === "completed"} onClick={() => setStatus("completed")} hint="Finished interviews" />
        <StatCard label="Interrupted" value={count("interrupted")} icon={STATUS_ICON.interrupted} tone="warn" active={status === "interrupted"} onClick={() => setStatus("interrupted")} hint="Ended early or idle" />
        <StatCard label="Expired" value={count("expired")} icon={STATUS_ICON.expired} tone="danger" active={status === "expired"} onClick={() => setStatus("expired")} hint="Expired or revoked" />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.35fr_1fr] mb-8">
        <Section title="Status overview" description="Share of all invitations by current status." icon={Clock3}>
          {rows.length ? (
            <div className="grid gap-5">
              <div className="flex h-3 w-full overflow-hidden rounded-full bg-surface-2" role="img" aria-label="Status distribution">
                {(Object.keys(STATUS_INFO) as InviteStatus[]).map((s) => count(s) ? <div key={s} className={STATUS_BAR[s]} style={{ width: `${(count(s) / rows.length) * 100}%` }} title={`${STATUS_INFO[s].label}: ${count(s)}`} /> : null)}
              </div>
              <ul className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2.5 text-sm">
                {(Object.keys(STATUS_INFO) as InviteStatus[]).map((s) => (
                  <li key={s} className="flex items-center gap-2"><span aria-hidden className={`h-2.5 w-2.5 rounded-full ${STATUS_BAR[s]} ${s === "not_started" ? "ring-1 ring-line-strong" : ""}`} /><span className="text-ink-2">{STATUS_INFO[s].label}</span><span className="ml-auto tabular-nums text-muted">{count(s)}</span></li>
                ))}
              </ul>
              <div className="grid grid-cols-2 gap-3 border-t border-line pt-4">
                <div><p className="text-xs text-muted">Completion rate (started)</p><p className="mt-1 font-display text-2xl font-semibold tabular-nums">{completionRate}%</p></div>
                <div><p className="text-xs text-muted">Questions answered</p><p className="mt-1 font-display text-2xl font-semibold tabular-nums">{answered}</p></div>
              </div>
            </div>
          ) : <p className="text-sm text-muted">No invitations yet.</p>}
        </Section>
        <Section title="Live now" description="Students currently in an interview." icon={Radio}
          actions={live.length ? <Badge dot tone="ok">{live.length} live</Badge> : undefined}>
          {live.length ? (
            <ul className="grid gap-3">
              {live.slice(0, 5).map((r) => (
                <li key={r.id}>
                  <Link href={`/admin/invitations/view/?id=${r.id}`} className="flex items-center gap-3 rounded-xl p-2 -m-2 hover:bg-surface-2">
                    <span className="relative"><Avatar name={r.student_name} /><span aria-hidden className="absolute -right-0.5 -bottom-0.5 h-3 w-3 rounded-full bg-ok ring-2 ring-surface animate-pulse-ring" /></span>
                    <span className="min-w-0 flex-1">
                      <span className="flex justify-between gap-2 text-sm"><span className="font-medium truncate">{r.student_name}</span><span className="tabular-nums text-muted">{percent(r)}%</span></span>
                      <ProgressBar className="mt-1.5" value={percent(r)} label={`${r.student_name} progress`} />
                      <span className="mt-1 block text-xs text-muted truncate">{stageLabel(r)}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : <div className="py-6 text-center text-sm text-muted">No one is taking an interview right now.</div>}
        </Section>
      </div>

      <div className="flex items-end justify-between gap-3 mb-4">
        <div><h2 className="text-xl font-semibold">{status ? STATUS_INFO[status as InviteStatus].label : "Recent"} interviews</h2><p className="text-sm text-muted">Newest first.</p></div>
        <LinkButton variant="ghost" size="sm" href="/admin/interviews/">Manage all</LinkButton>
      </div>
      <InterviewsTable rows={rows} run={run} busy={busy} status={status} onStatus={setStatus} showFilters={false} limit={8} />
      <Card className="mt-6 px-4 py-3 text-xs text-muted bg-surface-2/60 shadow-none">Progress shows question completion and activity only. Answers are not recorded or scored.</Card>
    </>
  );
}
