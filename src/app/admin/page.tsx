import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card, PageHeader } from "@/components/ui";
import { getAIProvider } from "@/lib/ai/provider";

export const metadata = { title: "Admin" };

export default async function AdminHome() {
  await requireAdmin();
  const supabase = await createClient();
  const count = async (table: string, f?: (q: any) => any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
    let q = supabase.from(table).select("*", { count: "exact", head: true });
    if (f) q = f(q);
    return (await q).count ?? 0;
  };
  const [pending, active, students, sessions, completed, unis] = await Promise.all([
    count("question_bank", (q) => q.eq("review_status", "pending_review")),
    count("question_bank", (q) => q.eq("is_active", true)),
    count("student_profiles"),
    count("interview_sessions"),
    count("interview_sessions", (q) => q.eq("status", "completed")),
    count("universities"),
  ]);
  const ai = await getAIProvider();
  const tiles = [
    { label: "Questions awaiting review", value: pending, href: "/admin/questions?status=pending_review" },
    { label: "Active questions", value: active, href: "/admin/questions?active=1" },
    { label: "Universities", value: unis, href: "/admin/universities" },
    { label: "Students", value: students, href: "/admin/students" },
    { label: "Sessions", value: sessions, href: "/admin/sessions" },
    { label: "Completed sessions", value: completed, href: "/admin/sessions?status=completed" },
  ];
  return (
    <>
      <PageHeader title="Admin overview" description={`AI provider: ${ai ? ai.name : "not configured (sessions use the approved question bank only)"}`} />
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
      {active === 0 && (
        <Card className="mt-8 p-5">
          <p className="font-medium">Next step: publish questions</p>
          <p className="text-sm text-muted mt-1">Students cannot start interviews until at least some questions are approved. Review the imported questions, then add universities and courses.</p>
          <Link href="/admin/questions?status=pending_review" className="mt-3 inline-block text-sm font-medium text-accent">Review imported questions →</Link>
        </Card>
      )}
    </>
  );
}
