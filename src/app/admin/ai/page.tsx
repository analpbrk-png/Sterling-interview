"use client";
import { createClient } from "@/lib/supabase/client";
import { must, useLoad } from "@/lib/use-load";
import { LocalAiPanel } from "@/components/admin/local-ai";
import { LoadError, Loading, PageHeader } from "@/components/ui";

export default function AiSettings() {
  const { data, error, loading, reload } = useLoad(async () => {
    const courses = must(await createClient().from("courses").select("id, name, modules, is_verified, universities(name, country)").eq("is_active", true).order("name"));
    return courses.map((x) => ({ id: x.id, name: x.name, modules: x.modules ?? [], is_verified: x.is_verified, university: x.universities as unknown as { name: string; country: string } }));
  }, []);
  if (loading && !data) return <Loading />;
  if (error || !data) return <LoadError error={error ?? "Not found"} onRetry={reload} />;
  return (
    <>
      <PageHeader eyebrow="Configuration" title="AI settings" description="Free, local AI for CV reading and personalised questions. No paid API is required. Status shows “Active” only after a real test on this device." />
      <div className="max-w-5xl"><LocalAiPanel courses={data} /></div>
    </>
  );
}
