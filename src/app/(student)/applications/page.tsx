"use client";
import Link from "next/link";
import { z } from "zod";
import { useAuth } from "@/components/auth-provider";
import { createClient } from "@/lib/supabase/client";
import { maybe, must, useLoad } from "@/lib/use-load";
import { useAction } from "@/lib/use-action";
import { useFlash } from "@/lib/flash";
import { Badge, Button, Card, EmptyState, FlashBar, LinkButton, LoadError, Loading, Notice, PageHeader } from "@/components/ui";
import { ApplicationForm } from "@/components/student/application-form";

const AppSchema = z.object({
  university_id: z.string().uuid("Choose a university"),
  course_id: z.string().uuid("Choose a course"),
  intake: z.string().trim().max(40).transform((v) => v || null),
});

export default function ApplicationsPage() {
  const { user } = useAuth();
  const [pageFlash] = useFlash();
  const { run, busy, flash } = useAction();
  const supabase = createClient();
  const { data, error, loading, reload } = useLoad(async () => {
    const [apps, universities, courses, profile, sessions] = await Promise.all([
      supabase.from("student_applications").select("id, intake, created_at, universities(name, country), courses(name, level)").eq("user_id", user!.id).order("created_at"),
      supabase.from("universities").select("id, name").eq("is_active", true).order("name"),
      supabase.from("courses").select("id, name, university_id").eq("is_active", true).order("name"),
      supabase.from("student_profiles").select("user_id").eq("user_id", user!.id).maybeSingle(),
      supabase.from("interview_sessions").select("application_id, status").eq("user_id", user!.id),
    ]);
    return { apps: must(apps), universities: must(universities), courses: must(courses), profile: maybe(profile), sessions: must(sessions) };
  }, [user?.id]);

  if (loading && !data) return <Loading />;
  if (error || !data) return <LoadError error={error ?? "Not found"} onRetry={reload} />;
  const { apps, universities, courses, profile, sessions } = data;
  const done = (id: string) => sessions.filter((s) => s.application_id === id && s.status === "completed").length;

  const add = (form: FormData) => void run(async () => {
    const parsed = AppSchema.safeParse(Object.fromEntries(form));
    if (!parsed.success) throw new Error(parsed.error.issues[0].message);
    const { error } = await supabase.from("student_applications").insert({ user_id: user!.id, ...parsed.data });
    if (error) throw new Error(error.code === "23505" ? "You have already added this course." : "That course does not belong to the chosen university.");
    await reload();
    return "Application added.";
  });

  const remove = (id: string, label: string) => {
    if (!window.confirm(`Remove ${label}?`)) return;
    void run(async () => {
      const { error } = await supabase.from("student_applications").delete().eq("id", id).eq("user_id", user!.id);
      if (error) throw new Error("Could not remove the application.");
      await reload();
      return "Application removed. Its past session summaries remain in your history.";
    });
  };

  return (
    <>
      <PageHeader title="Your applications" description="Add each university and course you are applying to. Every practice interview is generated for one application only." />
      <FlashBar flash={flash ?? pageFlash} />
      {!profile && <div className="mb-6"><Notice tone="warn" title="Complete your profile first">Your name and student ID are needed for the introduction step. <Link className="underline" href="/profile/">Go to profile</Link></Notice></div>}

      <Card className="p-5 sm:p-6 mb-8">
        <h2 className="font-semibold mb-4">Add an application</h2>
        {universities.length ? (
          <ApplicationForm onSubmit={add} busy={busy} universities={universities} courses={courses} />
        ) : (
          <Notice>No universities have been set up yet. Please check back soon.</Notice>
        )}
      </Card>

      {apps.length ? (
        <ul className="grid gap-3">
          {apps.map((a) => {
            const uni = a.universities as unknown as { name: string; country: string };
            const course = a.courses as unknown as { name: string; level: string | null };
            const n = done(a.id);
            return (
              <li key={a.id}>
                <Card className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-ink">{course.name}</p>
                    <p className="text-sm text-muted">{uni.name} · {uni.country}{a.intake ? ` · ${a.intake}` : ""}</p>
                    <div className="mt-2"><Badge tone={n ? "ok" : "neutral"}>{n} completed practice{n === 1 ? "" : "s"}</Badge></div>
                  </div>
                  <div className="flex gap-2">
                    <LinkButton href={`/interview/new/?application=${a.id}`}>Start practice</LinkButton>
                    <Button variant="secondary" disabled={busy} onClick={() => remove(a.id, `${course.name} at ${uni.name}`)}>Remove</Button>
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
