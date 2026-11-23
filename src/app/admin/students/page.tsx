import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Badge, Card, EmptyState, FlashMessage, PageHeader } from "@/components/ui";
import { ConfirmSubmit, SubmitButton } from "@/components/ui/submit-button";
import { deleteStudent, setUserRole } from "../actions";
import { formatDate } from "@/lib/format";

export const metadata = { title: "Students" };

export default async function Students({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  await requireAdmin();
  const supabase = await createClient();
  const [{ data: users }, { data: profiles }, { data: apps }, { data: sessions }] = await Promise.all([
    supabase.from("users").select("id, email, role, created_at").order("created_at", { ascending: false }).limit(500),
    supabase.from("student_profiles").select("user_id, full_name, student_id, resume_context_status"),
    supabase.from("student_applications").select("user_id"),
    supabase.from("interview_sessions").select("user_id, status"),
  ]);
  const prof = Object.fromEntries((profiles ?? []).map((p) => [p.user_id, p]));
  const n = (rows: Array<{ user_id: string }> | null, id: string) => (rows ?? []).filter((r) => r.user_id === id).length;
  return (
    <>
      <PageHeader title="Students" description="Profiles and activity. Passport files and CVs are private to each student and are not viewable here." />
      <FlashMessage searchParams={sp} />
      {users?.length ? (
        <Card className="divide-y divide-line">
          {users.map((u) => {
            const p = prof[u.id];
            return (
              <div key={u.id} className="p-4 flex flex-col lg:flex-row lg:items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium truncate">{p?.full_name ?? "Profile not completed"} {u.role === "admin" && <Badge tone="accent">Admin</Badge>}</p>
                  <p className="text-sm text-muted truncate">{u.email}{p?.student_id ? ` · ID ${p.student_id}` : ""} · joined {formatDate(u.created_at)}</p>
                </div>
                <div className="flex flex-wrap gap-1.5"><Badge>{n(apps, u.id)} applications</Badge><Badge>{n(sessions, u.id)} sessions</Badge>{p?.resume_context_status === "confirmed" && <Badge tone="ok">CV confirmed</Badge>}</div>
                <div className="flex gap-2">
                  <form action={setUserRole}><input type="hidden" name="id" value={u.id} /><input type="hidden" name="role" value={u.role === "admin" ? "student" : "admin"} /><SubmitButton variant="ghost">{u.role === "admin" ? "Make student" : "Make admin"}</SubmitButton></form>
                  <form action={deleteStudent}><input type="hidden" name="id" value={u.id} /><ConfirmSubmit variant="danger" message="Delete this student's account, documents and history permanently?">Delete</ConfirmSubmit></form>
                </div>
              </div>
            );
          })}
        </Card>
      ) : <EmptyState title="No students yet" />}
    </>
  );
}
