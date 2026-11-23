"use client";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { maybe, must, useLoad, useParam } from "@/lib/use-load";
import { Badge, Card, LoadError, Loading, PageHeader } from "@/components/ui";
import { formatDate, formatDuration, STATUS_LABEL } from "@/lib/format";

export default function SessionDetail() {
  const id = useParam("id");
  const { data, error, loading } = useLoad(async () => {
    if (!id) return null;
    const c = createClient();
    const s = maybe(await c.from("interview_sessions").select("*").eq("id", id).maybeSingle());
    if (!s) return null;
    const [qs, p] = await Promise.all([
      c.from("interview_session_questions").select("*").eq("session_id", id).order("position"),
      c.from("student_profiles").select("full_name").eq("user_id", s.user_id).maybeSingle(),
    ]);
    return { s, qs: must(qs), name: maybe(p)?.full_name as string | undefined };
  }, [id]);
  if (id === undefined || (loading && !data)) return <Loading />;
  if (error || !data) return <LoadError error={error ?? "Session not found."} />;
  const { s, qs, name } = data;
  return (
    <>
      <PageHeader title={name ?? "Session"} description={<Link href="/admin/sessions/" className="text-accent">← Sessions</Link>} />
      <Card className="p-5 mb-6 grid gap-3 sm:grid-cols-3 text-sm">
        <div><p className="text-muted">University</p><p className="font-medium">{s.university_name}</p></div>
        <div><p className="text-muted">Course</p><p className="font-medium">{s.course_name}</p></div>
        <div><p className="text-muted">Status</p><p className="font-medium">{STATUS_LABEL[s.status]}</p></div>
        <div><p className="text-muted">Created</p><p className="font-medium">{formatDate(s.created_at)}</p></div>
        <div><p className="text-muted">Duration</p><p className="font-medium">{formatDuration(s.duration_seconds)}</p></div>
        <div><p className="text-muted">Question source</p><p className="font-medium">{s.generation_mode === "bank_and_ai" ? "Bank + AI personalised" : "Bank only"}</p></div>
        {s.generation_notice && <p className="sm:col-span-3 text-warn">{s.generation_notice}</p>}
      </Card>
      <Card className="divide-y divide-line">
        {qs.map((q) => (
          <div key={q.id} className="p-4 flex gap-3">
            <span className="text-sm text-muted tabular-nums w-6">{q.position + 1}.</span>
            <div className="flex-1">
              <p className="text-ink">{q.question_text}</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                <Badge tone={q.state === "completed" || q.state === "timed_out" ? "ok" : "neutral"}>{q.state.replace("_", " ")}</Badge>
                <Badge>{q.origin === "ai_generated" ? "AI" : q.origin}</Badge>
                <Badge>{q.prep_seconds}s / {q.answer_seconds}s · {q.submission_mode}</Badge>
                {q.completion_method && <Badge>{q.completion_method}</Badge>}
              </div>
            </div>
          </div>
        ))}
      </Card>
    </>
  );
}
