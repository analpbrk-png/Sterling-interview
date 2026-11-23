"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { callFunction } from "@/lib/functions";
import { must, useLoad } from "@/lib/use-load";
import { useAction } from "@/lib/use-action";
import { setFlash } from "@/lib/flash";
import { useAiStatus } from "@/lib/admin/use-ai-status";
import { Button, Card, Field, FlashBar, Input, LoadError, Loading, Notice, PageHeader, Select } from "@/components/ui";

export default function Generate() {
  const router = useRouter();
  const ai = useAiStatus();
  const { run, busy, flash } = useAction();
  const { data: courses, error, loading } = useLoad(async () => must(await createClient().from("courses").select("id, name, is_verified, universities(name)").order("name")), []);
  if (loading && !courses) return <Loading />;
  if (error || !courses) return <LoadError error={error ?? "Not found"} />;
  return (
    <>
      <PageHeader title="Generate questions with AI" description={<Link href="/admin/questions/" className="text-accent">← Question bank</Link>} />
      <FlashBar flash={flash} />
      {ai && !ai.configured && <div className="mb-6 max-w-2xl"><Notice tone="warn" title="AI is not configured">Set the ANTHROPIC_API_KEY secret for your Supabase Edge Functions to enable generation. Nothing will be generated until then.</Notice></div>}
      <Card className="p-5 max-w-2xl">
        <p className="text-sm text-muted mb-5">Runs in a Supabase Edge Function (your API key never reaches the browser). Generated questions use only the course&apos;s verified facts, are checked automatically for invented details, and are saved as pending review.</p>
        <form onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          void run(async () => {
            const res = await callFunction<{ created: number }>("generate-questions", { courseId: f.get("course_id"), background: f.get("background"), count: Number(f.get("count")) });
            if (!res.data) throw new Error(res.error ?? "Generation failed.");
            setFlash({ tone: "ok", text: `${res.data.created} AI question(s) generated for review.` });
            router.push("/admin/questions/?origin=ai_generated&status=pending_review");
          });
        }} className="grid gap-4">
          <Field label="Course">
            <Select name="course_id" required defaultValue="">
              <option value="" disabled>Choose…</option>
              {courses.map((c) => <option key={c.id} value={c.id}>{(c.universities as unknown as { name: string }).name} — {c.name}{c.is_verified ? "" : " (unverified)"}</option>)}
            </Select>
          </Field>
          <Field label="Typical student background (optional)" hint="e.g. BCom graduate, Computer Science BSc. Helps tailor the wording."><Input name="background" maxLength={200} /></Field>
          <Field label="How many"><Input name="count" type="number" min={1} max={10} defaultValue={5} /></Field>
          <Button type="submit" disabled={busy || !ai?.configured}>{busy ? "Generating…" : "Generate for review"}</Button>
        </form>
      </Card>
    </>
  );
}
