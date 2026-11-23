import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PrepareInterview } from "@/components/interview/prepare";

export const metadata = { title: "Prepare interview" };

export default async function NewInterview({ searchParams }: { searchParams: Promise<{ application?: string }> }) {
  const { application } = await searchParams;
  await requireUser(`/interview/new?application=${application ?? ""}`);
  if (!application) redirect("/applications");
  const supabase = await createClient();
  const { data: app } = await supabase
    .from("student_applications")
    .select("id, universities(name), courses(name)")
    .eq("id", application)
    .maybeSingle();
  if (!app) redirect("/applications?error=" + encodeURIComponent("That application was not found."));
  return (
    <PrepareInterview
      applicationId={app.id}
      universityName={(app.universities as unknown as { name: string }).name}
      courseName={(app.courses as unknown as { name: string }).name}
    />
  );
}
