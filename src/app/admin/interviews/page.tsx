"use client";
import { useState } from "react";
import { Plus } from "lucide-react";
import { useAction } from "@/lib/use-action";
import { useFlash } from "@/lib/flash";
import { STATUS_INFO, type InviteStatus } from "@/lib/admin/progress";
import { InterviewsTable } from "@/components/admin/interviews-table";
import { useProgressRows } from "@/components/admin/use-progress-rows";
import { FlashBar, LinkButton, LoadError, Loading, PageHeader, cx } from "@/components/ui";

export default function InterviewsPage() {
  const [pageFlash] = useFlash();
  const { run, busy, flash } = useAction();
  const [status, setStatus] = useState("");
  const { data: rows, error, loading, reload } = useProgressRows();
  if (loading && !rows) return <Loading />;
  if (error || !rows) return <LoadError error={error ?? "Not found"} onRetry={reload} />;
  const tabs: Array<[string, string, number]> = [["", "All", rows.length], ...(Object.keys(STATUS_INFO) as InviteStatus[]).map((s) => [s, STATUS_INFO[s].label, rows.filter((r) => r.status === s).length] as [string, string, number])];
  return (
    <>
      <PageHeader eyebrow="Interviews" title="Student interviews" description="Every interview link, its live progress and actions."
        actions={<LinkButton href="/admin/invitations/new/"><Plus /> New interview</LinkButton>} />
      <FlashBar flash={flash ?? pageFlash} />
      <div className="mb-4 -mx-4 px-4 overflow-x-auto no-scrollbar">
        <div role="tablist" aria-label="Filter by status" className="inline-flex gap-1 rounded-xl bg-surface-2 border border-line p-1">
          {tabs.map(([v, label, n]) => (
            <button key={v} role="tab" type="button" aria-selected={status === v} onClick={() => setStatus(v)}
              className={cx("h-9 whitespace-nowrap rounded-lg px-3.5 text-[13px] font-medium transition", status === v ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink")}>
              {label} <span className="ml-1 tabular-nums text-muted">{n}</span>
            </button>
          ))}
        </div>
      </div>
      <InterviewsTable rows={rows} run={run} busy={busy} status={status} onStatus={setStatus} />
    </>
  );
}
