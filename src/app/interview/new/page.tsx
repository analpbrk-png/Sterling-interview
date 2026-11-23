"use client";
import { createClient } from "@/lib/supabase/client";
import { useLoad, useParam } from "@/lib/use-load";
import { LoadError, Loading } from "@/components/ui";
import { PrepareInterview } from "@/components/interview/prepare";

export default function NewInterview() {
  const application = useParam("application");
  const { data, error, loading } = useLoad(async () => {
    if (!application) return null;
    const { data } = await createClient().from("student_applications").select("id, universities(name), courses(name)").eq("id", application).maybeSingle();
    return data;
  }, [application]);
  if (application === undefined || loading) return <Loading />;
  if (error || !data) return <div className="max-w-md mx-auto p-6"><LoadError error={error ?? "That application was not found."} /></div>;
  return (
    <PrepareInterview
      applicationId={data.id}
      universityName={(data.universities as unknown as { name: string }).name}
      courseName={(data.courses as unknown as { name: string }).name}
    />
  );
}
