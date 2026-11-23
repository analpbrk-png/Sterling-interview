"use client";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useLoad } from "@/lib/use-load";
import { useAiStatus } from "@/lib/admin/use-ai-status";
import { Card, LoadError, Loading, PageHeader } from "@/components/ui";

export default function AdminHome() {
  const ai = useAiStatus();
  const { data, error, loading, reload } = useLoad(async () => {
    const supabase = createClient();
    const count = async (table: string, filter?: [string, unknown]) => {
      let q = supabase.from(table).select("*", { count: "exact", head: true });
      if (filter) q = q.eq(filter[0], filter[1]);
      return (await q).count ?? 0;
    };
    const [pending, active, students, sessions, completed, unis] = await Promise.all([
      count("question_bank", ["review_status", "pending_review"]), count("question_bank", ["is_active", true]),
      count("student_profiles"), count("interview_sessions"), count("interview_sessions", ["status", "completed"]), count("universities"),
    ]);
    return { pending, active, students, sessions, completed, unis };
  }, []);
  if (loading && !data) return <Loading />;
  if (error || !data) return <LoadError error={error ?? "Not found"} onRetry={reload} />;
  const tiles = [
    { label: "Questions awaiting review", value: data.pending, href: "/admin/questions/?status=pending_review" },
    { label: "Active questions", value: data.active, href: "/admin/questions/?active=1" },
    { label: "Universities", value: data.unis, href: "/admin/universities/" },
    { label: "Students", value: data.students, href: "/admin/students/" },
    { label: "Sessions", value: data.sessions, href: "/admin/sessions/" },
    { label: "Completed sessions", value: data.completed, href: "/admin/sessions/?status=completed" },
  ];
  return (
    <>
      <PageHeader title="Admin overview" description={ai === null ? "Checking AI provider…" : `AI provider: ${ai.configured ? ai.provider : "not configured (sessions use the approved question bank only)"}`} />
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-3">
        {tiles.map((t) => (
          <Link key={t.label} href={t.href}>
            <Card className="p-5 hover:border-accent/50 transition">
              <p className="text-sm text-muted">{t.label}</p>
              <p className="mt-1 text-3xl font-semibold tabular-nums">{t.value}</p>
            </Card>
          </Link>
        ))}
      </div>
      {data.active === 0 && (
        <Card className="mt-8 p-5">
          <p className="font-medium">Next step: publish questions</p>
          <p className="text-sm text-muted mt-1">Students cannot start interviews until at least some questions are approved. Review the imported questions, then add universities and courses.</p>
          <Link href="/admin/questions/?status=pending_review" className="mt-3 inline-block text-sm font-medium text-accent">Review imported questions →</Link>
        </Card>
      )}
    </>
  );
}
