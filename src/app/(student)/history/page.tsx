import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Badge, Card, EmptyState, LinkButton, PageHeader } from "@/components/ui";
import { formatDate, formatDuration, STATUS_LABEL } from "@/lib/format";

export const metadata = { title: "History" };

export default async function HistoryPage() {
  const user = await requireUser("/history");
  const supabase = await createClient();
  const { data: sessions } = await supabase
    .from("interview_sessions")
    .select("id, university_name, course_name, status, question_count, current_position, created_at, duration_seconds, generation_mode")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(100);
  return (
    <>
      <PageHeader title="Practice history" description="Session summaries only. No audio or video is ever recorded or stored." />
      {sessions?.length ? (
        <Card className="divide-y divide-line">
          {sessions.map((s) => (
            <div key={s.id} className="p-4 sm:px-5 flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="font-medium text-ink truncate">{s.course_name}</p>
                <p className="text-sm text-muted truncate">{s.university_name} · {formatDate(s.created_at)}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
                <Badge tone={s.status === "completed" ? "ok" : s.status === "in_progress" ? "accent" : "neutral"}>{STATUS_LABEL[s.status]}</Badge>
                <span>{Math.min(s.current_position, s.question_count)}/{s.question_count} questions</span>
                <span>· {formatDuration(s.duration_seconds)}</span>
                {s.status === "in_progress" || s.status === "ready" ? (
                  <Link className="text-accent font-medium ml-2" href={`/interview/${s.id}`}>Resume</Link>
                ) : null}
              </div>
            </div>
          ))}
        </Card>
      ) : (
        <EmptyState title="No sessions yet" action={<LinkButton href="/applications">Start a practice</LinkButton>}>Your completed practice interviews will appear here.</EmptyState>
      )}
    </>
  );
}
