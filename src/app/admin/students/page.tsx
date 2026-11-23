"use client";
import { useAuth } from "@/components/auth-provider";
import { createClient } from "@/lib/supabase/client";
import { must, useLoad } from "@/lib/use-load";
import { useAction } from "@/lib/use-action";
import { deleteStudent, setUserRole } from "@/lib/admin/ops";
import { Badge, Button, Card, EmptyState, FlashBar, LoadError, Loading, PageHeader } from "@/components/ui";
import { formatDate } from "@/lib/format";

export default function Students() {
  const { user } = useAuth();
  const { run, busy, flash } = useAction();
  const { data, error, loading, reload } = useLoad(async () => {
    const s = createClient();
    const [users, profiles, apps, sessions] = await Promise.all([
      s.from("users").select("id, email, role, created_at").order("created_at", { ascending: false }).limit(500),
      s.from("student_profiles").select("user_id, full_name, student_id, resume_context_status"),
      s.from("student_applications").select("user_id"),
      s.from("interview_sessions").select("user_id, status"),
    ]);
    return { users: must(users), profiles: must(profiles), apps: must(apps), sessions: must(sessions) };
  }, []);
  if (loading && !data) return <Loading />;
  if (error || !data) return <LoadError error={error ?? "Not found"} onRetry={reload} />;
  const prof = Object.fromEntries(data.profiles.map((p) => [p.user_id, p]));
  const n = (rows: Array<{ user_id: string }>, id: string) => rows.filter((r) => r.user_id === id).length;
  return (
    <>
      <PageHeader title="Students" description="Profiles and activity. Passport files and CVs are private to each student and are not viewable here." />
      <FlashBar flash={flash} />
      {data.users.length ? (
        <Card className="divide-y divide-line">
          {data.users.map((u) => {
            const p = prof[u.id];
            return (
              <div key={u.id} className="p-4 flex flex-col lg:flex-row lg:items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium truncate">{p?.full_name ?? "Profile not completed"} {u.role === "admin" && <Badge tone="accent">Admin</Badge>}</p>
                  <p className="text-sm text-muted truncate">{u.email}{p?.student_id ? ` · ID ${p.student_id}` : ""} · joined {formatDate(u.created_at)}</p>
                </div>
                <div className="flex flex-wrap gap-1.5"><Badge>{n(data.apps, u.id)} applications</Badge><Badge>{n(data.sessions, u.id)} sessions</Badge>{p?.resume_context_status === "confirmed" && <Badge tone="ok">CV confirmed</Badge>}</div>
                <div className="flex gap-2">
                  <Button variant="ghost" disabled={busy} onClick={() => void run(async () => { await setUserRole(u.id, u.role === "admin" ? "student" : "admin", user!.id); await reload(); return "Role updated."; })}>{u.role === "admin" ? "Make student" : "Make admin"}</Button>
                  <Button variant="danger" disabled={busy} onClick={() => window.confirm("Delete this student's account, documents and history permanently?") && void run(async () => { await deleteStudent(u.id, user!.id); await reload(); return "Student and all their data deleted."; })}>Delete</Button>
                </div>
              </div>
            );
          })}
        </Card>
      ) : <EmptyState title="No students yet" />}
    </>
  );
}
