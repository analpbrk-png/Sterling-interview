import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card, EmptyState, FlashMessage, LinkButton, Notice, PageHeader, Badge } from "@/components/ui";
import { ConfirmSubmit } from "@/components/ui/submit-button";
import { ApplicationForm } from "@/components/student/application-form";
import { addApplication, removeApplication } from "../actions";

export const metadata = { title: "Applications" };

export default async function ApplicationsPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const user = await requireUser("/applications");
  const supabase = await createClient();
  const [{ data: apps }, { data: universities }, { data: courses }, { data: profile }, { data: sessions }] = await Promise.all([
    supabase.from("student_applications").select("id, intake, created_at, universities(name, country), courses(name, level)").eq("user_id", user.id).order("created_at"),
    supabase.from("universities").select("id, name").eq("is_active", true).order("name"),
    supabase.from("courses").select("id, name, university_id").eq("is_active", true).order("name"),
    supabase.from("student_profiles").select("user_id").eq("user_id", user.id).maybeSingle(),
    supabase.from("interview_sessions").select("application_id, status").eq("user_id", user.id),
  ]);
  const count = (id: string) => (sessions ?? []).filter((s) => s.application_id === id && s.status === "completed").length;

  return (
    <>
      <PageHeader title="Your applications" description="Add each university and course you are applying to. Every practice interview is generated for one application only." />
      <FlashMessage searchParams={sp} />
      {!profile && <div className="mb-6"><Notice tone="warn" title="Complete your profile first">Your name and student ID are needed for the introduction step. <a className="underline" href="/profile">Go to profile</a></Notice></div>}

      <Card className="p-5 sm:p-6 mb-8">
        <h2 className="font-semibold mb-4">Add an application</h2>
        {universities?.length ? (
          <ApplicationForm action={addApplication} universities={universities} courses={courses ?? []} />
        ) : (
          <Notice>No universities have been set up yet. Please check back soon.</Notice>
        )}
      </Card>

      {apps?.length ? (
        <ul className="grid gap-3">
          {apps.map((a) => {
            const uni = a.universities as unknown as { name: string; country: string };
            const course = a.courses as unknown as { name: string; level: string | null };
            const done = count(a.id);
            return (
              <li key={a.id}>
                <Card className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-ink">{course.name}</p>
                    <p className="text-sm text-muted">{uni.name} · {uni.country}{a.intake ? ` · ${a.intake}` : ""}</p>
                    <div className="mt-2"><Badge tone={done ? "ok" : "neutral"}>{done} completed practice{done === 1 ? "" : "s"}</Badge></div>
                  </div>
                  <div className="flex gap-2">
                    <LinkButton href={`/interview/new?application=${a.id}`} aria-disabled={!profile}>Start practice</LinkButton>
                    <form action={removeApplication}>
                      <input type="hidden" name="id" value={a.id} />
                      <ConfirmSubmit variant="secondary" message={`Remove ${course.name} at ${uni.name}?`}>Remove</ConfirmSubmit>
                    </form>
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState title="No applications yet">Add the university and course you are applying to, then start a practice interview.</EmptyState>
      )}
    </>
  );
}
