import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Badge, Card, EmptyState, PageHeader, Select, Button } from "@/components/ui";
import { formatDate, formatDuration, STATUS_LABEL } from "@/lib/format";

export const metadata = { title: "Sessions" };

export default async function Sessions({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const sp = await searchParams;
  await requireAdmin();
  const supabase = await createClient();
  let q = supabase.from("interview_sessions").select("id, user_id, university_name, course_name, status, question_count, current_position, created_at, duration_seconds, generation_mode").order("created_at", { ascending: false }).limit(200);
  if (sp.status) q = q.eq("status", sp.status);
  const { data: sessions } = await q;
  const ids = [...new Set((sessions ?? []).map((s) => s.user_id))];
  const { data: profiles } = ids.length ? await supabase.from("student_profiles").select("user_id, full_name").in("user_id", ids) : { data: [] };
  const name = Object.fromEntries((profiles ?? []).map((p) => [p.user_id, p.full_name]));
  return (
    <>
      <PageHeader title="Interview sessions" description="Session metadata only. No recordings exist: the platform never records audio or video." />
      <form method="get" className="flex gap-3 mb-5 max-w-sm">
        <Select name="status" defaultValue={sp.status ?? ""} aria-label="Status"><option value="">All statuses</option>{Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
        <Button variant="secondary" type="submit">Filter</Button>
      </form>
      {sessions?.length ? (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-muted"><tr className="border-b border-line">{["Student", "University", "Course", "Date", "Questions", "Duration", "Status"].map((h) => <th key={h} className="px-4 py-3 font-medium whitespace-nowrap">{h}</th>)}</tr></thead>
            <tbody>
              {sessions.map((s) => (
                <tr key={s.id} className="border-b border-line last:border-0 hover:bg-surface-2/60">
                  <td className="px-4 py-3"><Link href={`/admin/sessions/${s.id}`} className="font-medium text-accent">{name[s.user_id] ?? "—"}</Link></td>
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
