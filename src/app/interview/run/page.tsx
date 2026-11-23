"use client";
import { useAuth } from "@/components/auth-provider";
import { createClient } from "@/lib/supabase/client";
import { brand } from "@/config/brand";
import { parseSessionConfig } from "@/lib/interview/config";
import { maybe, must, useLoad, useParam } from "@/lib/use-load";
import { InterviewRunner } from "@/components/interview/interview-runner";
import { Card, LinkButton, LoadError, Loading } from "@/components/ui";
import { formatDuration, STATUS_LABEL } from "@/lib/format";

export default function InterviewPage() {
  const { user } = useAuth();
  const id = useParam("id");
  const { data, error, loading } = useLoad(async () => {
    if (!id) return null;
    const supabase = createClient();
    const session = maybe(await supabase.from("interview_sessions").select("*").eq("id", id).eq("user_id", user!.id).maybeSingle());
    if (!session) return null;
    const [questions, profile] = await Promise.all([
      supabase.from("interview_session_questions").select("position, question_text, prep_seconds, answer_seconds, submission_mode, state").eq("session_id", id).order("position"),
      supabase.from("student_profiles").select("full_name, student_id").eq("user_id", user!.id).maybeSingle(),
    ]);
    return { session, questions: must(questions), profile: maybe(profile) };
  }, [id, user?.id]);

  if (id === undefined || loading) return <Loading label="Loading your interview…" />;
  if (error) return <div className="max-w-md mx-auto p-6"><LoadError error={error} /></div>;
  if (!data || !data.questions.length) return <div className="max-w-md mx-auto p-6"><LoadError error="This interview was not found." /></div>;
  const { session, questions, profile } = data;

  if (session.status === "completed" || session.status === "abandoned") {
    return (
      <div className="min-h-dvh grid place-items-center px-4">
        <Card className="max-w-md w-full p-6 text-center">
          <h1 className="text-xl font-semibold">{STATUS_LABEL[session.status]}</h1>
          <p className="mt-2 text-muted">{session.course_name} · {session.university_name}</p>
          <p className="mt-1 text-sm text-muted">Duration: {formatDuration(session.duration_seconds)}</p>
          <div className="mt-6 flex gap-3 justify-center">
            <LinkButton href="/dashboard/" variant="secondary">Dashboard</LinkButton>
            {session.application_id && <LinkButton href={`/interview/new/?application=${session.application_id}`}>Practice again</LinkButton>}
          </div>
        </Card>
      </div>
    );
  }

  return (
    <InterviewRunner
      brandName={brand.name}
      session={{
        id: session.id,
        applicationId: session.application_id,
        universityName: session.university_name,
        courseName: session.course_name,
        generationNotice: session.generation_notice,
        config: parseSessionConfig(session.config),
      }}
      questions={questions.map((q) => ({
        position: q.position, text: q.question_text, prepSeconds: q.prep_seconds, answerSeconds: q.answer_seconds,
        submissionMode: q.submission_mode, state: q.state,
      }))}
      identity={profile ? { fullName: profile.full_name, studentId: profile.student_id } : null}
    />
  );
}
