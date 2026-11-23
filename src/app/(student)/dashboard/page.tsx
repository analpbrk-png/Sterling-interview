"use client";
import Link from "next/link";
import { useAuth } from "@/components/auth-provider";
import { createClient } from "@/lib/supabase/client";
import { maybe, must, useLoad, useParam } from "@/lib/use-load";
import { Badge, Card, FlashBar, LinkButton, LoadError, Loading, PageHeader } from "@/components/ui";
import { formatDate, STATUS_LABEL } from "@/lib/format";

export default function Dashboard() {
  const { user } = useAuth();
  const err = useParam("error");
  const supabase = createClient();
  const { data, error, loading, reload } = useLoad(async () => {
    const [profile, apps, resume, sessions] = await Promise.all([
      supabase.from("student_profiles").select("full_name, resume_context_status").eq("user_id", user!.id).maybeSingle(),
      supabase.from("student_applications").select("id, universities(name), courses(name)").eq("user_id", user!.id).order("created_at"),
      supabase.from("student_documents").select("id").eq("user_id", user!.id).eq("kind", "resume").maybeSingle(),
      supabase.from("interview_sessions").select("id, course_name, university_name, status, created_at").eq("user_id", user!.id).order("created_at", { ascending: false }).limit(5),
    ]);
    return { profile: maybe(profile), apps: must(apps), resume: maybe(resume), sessions: must(sessions) };
  }, [user?.id]);
  if (loading && !data) return <Loading />;
  if (error || !data) return <LoadError error={error ?? "Not found"} onRetry={reload} />;
  const { profile, apps, resume, sessions } = data;
  const steps = [
    { done: !!profile, label: "Complete your profile", href: "/profile/" },
    { done: !!resume, label: "Upload your CV", href: "/profile/" },
    { done: profile?.resume_context_status === "confirmed", label: "Review your background", href: "/profile/" },
    { done: !!apps.length, label: "Add a university and course", href: "/applications/" },
  ];
  return (
    <>
      <PageHeader title={profile?.full_name ? `Hello, ${profile.full_name.split(" ")[0]}` : "Welcome"} description="Pick an application and practise. Each session uses a fresh mix of questions." />
      <FlashBar flash={err === "admin_only" ? { tone: "danger", text: "That area is for administrators only." } : null} />
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="grid gap-6 content-start">
          <Card className="p-5 sm:p-6">
            <h2 className="font-semibold">Practise now</h2>
            {apps.length ? (
              <ul className="mt-4 grid gap-2">
                {apps.map((a) => (
                  <li key={a.id} className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-xl border border-line px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium truncate">{(a.courses as unknown as { name: string }).name}</p>
                      <p className="text-sm text-muted truncate">{(a.universities as unknown as { name: string }).name}</p>
                    </div>
                    <LinkButton href={`/interview/new/?application=${a.id}`}>Start</LinkButton>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-muted">Add an application to begin. <Link className="text-accent" href="/applications/">Add application</Link></p>
            )}
          </Card>
          <Card className="p-5 sm:p-6">
            <div className="flex items-center justify-between"><h2 className="font-semibold">Recent sessions</h2><Link href="/history/" className="text-sm text-accent">All history</Link></div>
            {sessions.length ? (
              <ul className="mt-3 divide-y divide-line">
                {sessions.map((s) => (
                  <li key={s.id} className="py-3 flex items-center gap-3">
                    <div className="min-w-0 flex-1"><p className="text-sm font-medium truncate">{s.course_name}</p><p className="text-xs text-muted">{s.university_name} · {formatDate(s.created_at)}</p></div>
                    <Badge tone={s.status === "completed" ? "ok" : "neutral"}>{STATUS_LABEL[s.status]}</Badge>
                  </li>
                ))}
              </ul>
            ) : <p className="mt-2 text-sm text-muted">No sessions yet.</p>}
          </Card>
        </div>
        <Card className="p-5 sm:p-6 h-fit">
          <h2 className="font-semibold">Getting ready</h2>
          <ul className="mt-4 grid gap-3">
            {steps.map((s) => (
              <li key={s.label} className="flex items-center gap-3 text-sm">
                <span aria-hidden className={`grid h-5 w-5 place-items-center rounded-full text-[11px] ${s.done ? "bg-ok text-white" : "border border-line text-muted"}`}>{s.done ? "✓" : ""}</span>
                {s.done ? <span className="text-muted line-through decoration-line">{s.label}</span> : <Link href={s.href} className="text-ink hover:text-accent">{s.label}</Link>}
              </li>
            ))}
          </ul>
          <p className="mt-5 text-xs text-muted">Nothing is recorded. Your camera and microphone are used live, only on your device.</p>
        </Card>
      </div>
    </>
  );
}
