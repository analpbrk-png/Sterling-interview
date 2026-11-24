"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { CalendarClock, Inbox, Search } from "lucide-react";
import { percent, stageLabel, STATUS_INFO, type ProgressRow } from "@/lib/admin/progress";
import { RowActions } from "@/components/admin/link-actions";
import { Badge, Card, EmptyState, Input, LinkButton, ProgressBar, Select, cx } from "@/components/ui";
import { formatDate } from "@/lib/format";

type Run = (fn: () => Promise<string | void>) => Promise<void>;

export function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join("") || "?";
}

export function Avatar({ name, className }: { name: string; className?: string }) {
  return <span aria-hidden className={cx("grid h-10 w-10 shrink-0 place-items-center rounded-full bg-accent-soft text-accent-fg text-[13px] font-semibold font-display", className)}>{initials(name)}</span>;
}

/** Filters + desktop table + mobile cards for interview invitations. */
export function InterviewsTable({ rows, run, busy, status, onStatus, showFilters = true, limit }: {
  rows: ProgressRow[]; run: Run; busy: boolean; status: string; onStatus: (s: string) => void; showFilters?: boolean; limit?: number;
}) {
  const [q, setQ] = useState("");
  const [uni, setUni] = useState("");
  const [course, setCourse] = useState("");
  const filtered = useMemo(() => rows.filter((r) =>
    (!q || `${r.student_name} ${r.student_ref}`.toLowerCase().includes(q.toLowerCase())) &&
    (!uni || r.university_id === uni) && (!course || r.course_id === course) && (!status || r.status === status)), [rows, q, uni, course, status]);
  const shown = limit ? filtered.slice(0, limit) : filtered;
  const universities = [...new Map(rows.map((r) => [r.university_id, r.university_name])).entries()];
  const courses = [...new Map(rows.filter((r) => !uni || r.university_id === uni).map((r) => [r.course_id, r.course_name])).entries()];

  return (
    <div className="grid gap-4">
      {showFilters && (
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 xl:grid-cols-[2fr_1fr_1fr_1fr]">
          <div className="relative sm:col-span-2 xl:col-span-1">
            <Search aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-muted" />
            <Input placeholder="Search name or student ID" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search" className="pl-10" />
          </div>
          <Select value={uni} onChange={(e) => { setUni(e.target.value); setCourse(""); }} aria-label="University"><option value="">All universities</option>{universities.map(([id, n]) => <option key={id} value={id}>{n}</option>)}</Select>
          <Select value={course} onChange={(e) => setCourse(e.target.value)} aria-label="Course"><option value="">All courses</option>{courses.map(([id, n]) => <option key={id} value={id}>{n}</option>)}</Select>
          <Select value={status} onChange={(e) => onStatus(e.target.value)} aria-label="Status"><option value="">All statuses</option>{Object.entries(STATUS_INFO).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</Select>
        </div>
      )}

      {!shown.length ? (
        rows.length ? <EmptyState icon={Search} title="No interviews match these filters">Try clearing the search or choosing another status.</EmptyState> : (
          <EmptyState icon={Inbox} title="No interviews yet" action={<LinkButton href="/admin/invitations/new/">Create the first interview link</LinkButton>}>
            Create an interview for a student, then share the link by WhatsApp or email.
          </EmptyState>
        )
      ) : (
        <>
          {/* Desktop / laptop: table */}
          <Card className="hidden lg:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-[11.5px] uppercase tracking-[0.08em] text-muted">
                  {["Student", "University & course", "Status", "Progress", "Created", ""].map((h, i) => <th key={i} className={cx("px-4 py-3.5 font-semibold whitespace-nowrap", i === 5 && "text-right", i === 4 && "hidden 2xl:table-cell")}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.id} className="border-b border-line last:border-0 hover:bg-surface-2/50 transition-colors">
                    <td className="px-4 py-4">
                      <Link href={`/admin/invitations/view/?id=${r.id}`} className="flex items-center gap-3 group">
                        <Avatar name={r.student_name} />
                        <span className="min-w-0">
                          <span className="block font-medium text-ink group-hover:text-accent-fg truncate max-w-[180px]">{r.student_name}</span>
                          <span className="block text-xs text-muted">ID {r.student_ref}</span>
                        </span>
                      </Link>
                    </td>
                    <td className="px-4 py-4 max-w-[220px]"><p className="truncate text-ink">{r.university_name}</p><p className="truncate text-xs text-muted">{r.course_name}</p></td>
                    <td className="px-4 py-4">
                      <Badge dot tone={STATUS_INFO[r.status].tone}>{STATUS_INFO[r.status].label}</Badge>
                      {r.revoked_at && <p className="mt-1 text-xs text-danger">Link revoked</p>}
                    </td>
                    <td className="px-4 py-4 min-w-[160px]">
                      {r.total_questions ? (
                        <>
                          <div className="flex items-baseline justify-between gap-2 text-xs"><span className="tabular-nums font-medium text-ink">{r.completed_questions}/{r.total_questions}</span><span className="tabular-nums text-muted">{percent(r)}%</span></div>
                          <ProgressBar className="mt-1.5" value={percent(r)} tone={r.status === "completed" ? "ok" : "accent"} label={`${r.student_name} progress`} />
                        </>
                      ) : null}
                      <p className="mt-1.5 text-xs text-muted truncate max-w-[220px]">{stageLabel(r)}</p>
                    </td>
                    <td className="hidden 2xl:table-cell px-4 py-4 whitespace-nowrap text-xs text-muted">{formatDate(r.created_at)}</td>
                    <td className="px-4 py-4"><RowActions row={r} run={run} busy={busy} compact /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          {/* Mobile / tablet: cards */}
          <ul className="grid gap-3 lg:hidden sm:grid-cols-2">
            {shown.map((r) => (
              <li key={r.id}>
                <Card className="p-4 grid gap-3.5">
                  <div className="flex items-start gap-3">
                    <Avatar name={r.student_name} />
                    <Link href={`/admin/invitations/view/?id=${r.id}`} className="min-w-0 flex-1">
                      <p className="font-medium text-ink truncate">{r.student_name}</p>
                      <p className="text-xs text-muted">ID {r.student_ref}</p>
                    </Link>
                    <Badge dot tone={STATUS_INFO[r.status].tone}>{STATUS_INFO[r.status].label}</Badge>
                  </div>
                  <div className="text-sm">
                    <p className="text-ink truncate">{r.university_name}</p>
                    <p className="text-xs text-muted truncate">{r.course_name}</p>
                  </div>
                  {r.total_questions ? (
                    <div>
                      <div className="flex justify-between text-xs"><span className="text-ink-2 tabular-nums">{r.completed_questions}/{r.total_questions} questions</span><span className="text-muted tabular-nums">{percent(r)}%</span></div>
                      <ProgressBar className="mt-1.5" value={percent(r)} tone={r.status === "completed" ? "ok" : "accent"} label={`${r.student_name} progress`} />
                    </div>
                  ) : null}
                  <div className="flex items-center gap-2 text-xs text-muted"><CalendarClock className="size-3.5" />{stageLabel(r)} · {formatDate(r.created_at)}</div>
                  {r.revoked_at && <p className="text-xs text-danger">Link revoked</p>}
                  <div className="border-t border-line pt-3"><RowActions row={r} run={run} busy={busy} /></div>
                </Card>
              </li>
            ))}
          </ul>
          {limit && filtered.length > limit && (
            <div className="text-center"><LinkButton variant="secondary" href="/admin/interviews/">View all {filtered.length} interviews</LinkButton></div>
          )}
        </>
      )}
    </div>
  );
}
