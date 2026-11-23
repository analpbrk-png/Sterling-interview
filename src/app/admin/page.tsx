"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { must, useLoad } from "@/lib/use-load";
import { useAction } from "@/lib/use-action";
import { useFlash } from "@/lib/flash";
import { useAiStatus } from "@/lib/admin/use-ai-status";
import { percent, stageLabel, STATUS_INFO, useLiveChanges, type InviteStatus, type ProgressRow } from "@/lib/admin/progress";
import { LinkActions } from "@/components/admin/link-actions";
import { Badge, Card, EmptyState, FlashBar, Input, LinkButton, LoadError, Loading, PageHeader, Select } from "@/components/ui";
import { formatDate } from "@/lib/format";

export default function AdminDashboard() {
  const ai = useAiStatus();
  const [pageFlash] = useFlash();
  const { run, busy, flash } = useAction();
  const [q, setQ] = useState("");
  const [uni, setUni] = useState("");
  const [course, setCourse] = useState("");
  const [status, setStatus] = useState("");
  const { data: rows, error, loading, reload } = useLoad(async () =>
    must(await createClient().from("admin_invitation_progress").select("*").order("created_at", { ascending: false }).limit(1000)) as ProgressRow[], []);
  useLiveChanges(() => void reload());

  const filtered = useMemo(() => (rows ?? []).filter((r) =>
    (!q || `${r.student_name} ${r.student_ref}`.toLowerCase().includes(q.toLowerCase())) &&
    (!uni || r.university_id === uni) && (!course || r.course_id === course) && (!status || r.status === status)), [rows, q, uni, course, status]);
  if (loading && !rows) return <Loading />;
  if (error || !rows) return <LoadError error={error ?? "Not found"} onRetry={reload} />;

  const count = (s: InviteStatus) => rows.filter((r) => r.status === s).length;
  const tiles = [
    { label: "Total invitations", value: rows.length, s: "" },
    { label: "Pending", value: count("not_started"), s: "not_started" },
    { label: "In progress", value: count("in_progress"), s: "in_progress" },
    { label: "Completed", value: count("completed"), s: "completed" },
    { label: "Interrupted", value: count("interrupted"), s: "interrupted" },
    { label: "Expired", value: count("expired"), s: "expired" },
  ];
  const universities = [...new Map(rows.map((r) => [r.university_id, r.university_name])).entries()];
  const courses = [...new Map(rows.filter((r) => !uni || r.university_id === uni).map((r) => [r.course_id, r.course_name])).entries()];

  return (
    <>
      <PageHeader title="Interview dashboard" description={<>Live progress, updated automatically. {ai && !ai.configured && <span className="text-warn">AI personalisation is not configured: interviews use the approved question bank.</span>}</>}
        actions={<LinkButton href="/admin/invitations/new/">New interview</LinkButton>} />
      <FlashBar flash={flash ?? pageFlash} />
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 mb-6">
        {tiles.map((t) => (
          <button key={t.label} type="button" onClick={() => setStatus(t.s)} className="text-left">
            <Card className={`p-4 transition ${status === t.s ? "border-accent" : "hover:border-accent/50"}`}>
              <p className="text-xs text-muted">{t.label}</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">{t.value}</p>
            </Card>
          </button>
        ))}
      </div>
      <div className="mb-4 grid gap-3 grid-cols-1 sm:grid-cols-[2fr_1fr_1fr_1fr]">
        <Input placeholder="Search name or student ID" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search" />
        <Select value={uni} onChange={(e) => { setUni(e.target.value); setCourse(""); }} aria-label="University"><option value="">All universities</option>{universities.map(([id, n]) => <option key={id} value={id}>{n}</option>)}</Select>
        <Select value={course} onChange={(e) => setCourse(e.target.value)} aria-label="Course"><option value="">All courses</option>{courses.map(([id, n]) => <option key={id} value={id}>{n}</option>)}</Select>
        <Select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status"><option value="">All statuses</option>{Object.entries(STATUS_INFO).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</Select>
      </div>
      {filtered.length ? (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-muted"><tr className="border-b border-line">{["Student", "University / course", "Status", "Progress", "Current stage", "Created", "Actions"].map((h) => <th key={h} className="px-4 py-3 font-medium whitespace-nowrap">{h}</th>)}</tr></thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className="border-b border-line last:border-0 align-top">
                  <td className="px-4 py-3"><Link href={`/admin/invitations/view/?id=${r.id}`} className="font-medium text-accent">{r.student_name}</Link><p className="text-xs text-muted">ID {r.student_ref}</p></td>
                  <td className="px-4 py-3"><p>{r.university_name}</p><p className="text-xs text-muted">{r.course_name}</p></td>
                  <td className="px-4 py-3"><Badge tone={STATUS_INFO[r.status].tone}>{STATUS_INFO[r.status].label}</Badge>{r.revoked_at && <p className="mt-1 text-xs text-danger">Link revoked</p>}</td>
                  <td className="px-4 py-3 min-w-36">
                    {r.total_questions ? (
                      <>
                        <p className="tabular-nums">{r.completed_questions} of {r.total_questions} · {percent(r)}%</p>
                        <div className="mt-1.5 h-1.5 rounded-full bg-line"><div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${percent(r)}%` }} /></div>
                      </>
                    ) : <span className="text-muted">—</span>}
                  </td>
                  <td className="px-4 py-3 text-ink-2">{stageLabel(r)}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-muted">{formatDate(r.created_at)}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1.5">
                      <LinkButton className="h-8 px-2.5 text-xs" href={`/admin/invitations/view/?id=${r.id}`}>View progress</LinkButton>
                      <LinkButton className="h-8 px-2.5 text-xs" variant="secondary" href={`/admin/invitations/view/?id=${r.id}#questions`}>View questions</LinkButton>
                      <LinkActions row={r} run={run} busy={busy} compact />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ) : rows.length ? <EmptyState title="No interviews match these filters" /> : (
        <EmptyState title="No interviews yet" action={<LinkButton href="/admin/invitations/new/">Create the first interview link</LinkButton>}>Create an interview for a student, then share the link by WhatsApp or email.</EmptyState>
      )}
      <p className="mt-4 text-xs text-muted">Progress shows question completion and activity only. Answers are not recorded or scored.</p>
    </>
  );
}
