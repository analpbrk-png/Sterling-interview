"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { must, useLoad } from "@/lib/use-load";
import { Badge, Card, EmptyState, LoadError, Loading, PageHeader, Select } from "@/components/ui";
import { formatDate, formatDuration, STATUS_LABEL } from "@/lib/format";

export default function Sessions() {
  const [status, setStatus] = useState<string | null>(null);
  useEffect(() => { setStatus(new URLSearchParams(window.location.search).get("status") ?? ""); }, []);
  const { data, error, loading, reload } = useLoad(async () => {
    if (status === null) return null;
    const s = createClient();
    let q = s.from("interview_sessions").select("id, user_id, university_name, course_name, status, question_count, current_position, created_at, duration_seconds").order("created_at", { ascending: false }).limit(200);
    if (status) q = q.eq("status", status);
    const sessions = must(await q);
    const ids = [...new Set(sessions.map((x) => x.user_id))];
    const profiles = ids.length ? must(await s.from("student_profiles").select("user_id, full_name").in("user_id", ids)) : [];
    return { sessions, name: Object.fromEntries(profiles.map((p) => [p.user_id, p.full_name])) as Record<string, string> };
  }, [status]);
  if (status === null || (loading && !data)) return <Loading />;
  if (error || !data) return <LoadError error={error ?? "Not found"} onRetry={reload} />;
  return (
    <>
      <PageHeader title="Interview sessions" description="Session metadata only. No recordings exist: the platform never records audio or video." />
      <div className="mb-5 max-w-xs">
        <Select value={status} aria-label="Status" onChange={(e) => { setStatus(e.target.value); window.history.replaceState(null, "", e.target.value ? `?status=${e.target.value}` : window.location.pathname); }}>
          <option value="">All statuses</option>{Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Select>
      </div>
      {data.sessions.length ? (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-muted"><tr className="border-b border-line">{["Student", "University", "Course", "Date", "Questions", "Duration", "Status"].map((h) => <th key={h} className="px-4 py-3 font-medium whitespace-nowrap">{h}</th>)}</tr></thead>
            <tbody>
              {data.sessions.map((s) => (
                <tr key={s.id} className="border-b border-line last:border-0 hover:bg-surface-2/60">
                  <td className="px-4 py-3"><Link href={`/admin/sessions/view/?id=${s.id}`} className="font-medium text-accent">{data.name[s.user_id] ?? "—"}</Link></td>
                  <td className="px-4 py-3">{s.university_name}</td>
                  <td className="px-4 py-3">{s.course_name}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{formatDate(s.created_at)}</td>
                  <td className="px-4 py-3 tabular-nums">{Math.min(s.current_position, s.question_count)}/{s.question_count}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{formatDuration(s.duration_seconds)}</td>
                  <td className="px-4 py-3"><Badge tone={s.status === "completed" ? "ok" : "neutral"}>{STATUS_LABEL[s.status]}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ) : <EmptyState title="No sessions yet" />}
    </>
  );
}
