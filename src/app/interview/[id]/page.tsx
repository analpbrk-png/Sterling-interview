import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { brand } from "@/config/brand";
import { parseSessionConfig } from "@/lib/interview/config";
import { InterviewRunner } from "@/components/interview/interview-runner";
import { LinkButton, Card } from "@/components/ui";
import { formatDuration, STATUS_LABEL } from "@/lib/format";

export const metadata = { title: "Interview" };

export default async function InterviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(`/interview/${id}`);
  const supabase = await createClient();
  const { data: session } = await supabase.from("interview_sessions").select("*").eq("id", id).eq("user_id", user.id).maybeSingle();
  if (!session) notFound();

  if (session.status === "completed" || session.status === "abandoned") {
    return (
      <div className="min-h-dvh grid place-items-center px-4">
        <Card className="max-w-md w-full p-6 text-center">
          <h1 className="text-xl font-semibold">{STATUS_LABEL[session.status]}</h1>
          <p className="mt-2 text-muted">{session.course_name} · {session.university_name}</p>
          <p className="mt-1 text-sm text-muted">Duration: {formatDuration(session.duration_seconds)}</p>
          <div className="mt-6 flex gap-3 justify-center">
            <LinkButton href="/dashboard" variant="secondary">Dashboard</LinkButton>
            {session.application_id && <LinkButton href={`/interview/new?application=${session.application_id}`}>Practice again</LinkButton>}
          </div>
        </Card>
      </div>
    );
  }

  const [{ data: questions }, { data: profile }] = await Promise.all([
    supabase.from("interview_session_questions").select("position, question_text, prep_seconds, answer_seconds, submission_mode, state").eq("session_id", id).order("position"),
    supabase.from("student_profiles").select("full_name, student_id").eq("user_id", user.id).maybeSingle(),
  ]);
  if (!questions?.length) notFound();

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
        position: q.position,
        text: q.question_text,
        prepSeconds: q.prep_seconds,
        answerSeconds: q.answer_seconds,
        submissionMode: q.submission_mode,
        state: q.state,
      }))}
      identity={profile ? { fullName: profile.full_name, studentId: profile.student_id } : null}
    />
  );
}
