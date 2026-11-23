import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getAIProvider } from "@/lib/ai/provider";
import { Card, Field, FlashMessage, Input, Notice, PageHeader, Select } from "@/components/ui";
import { SubmitButton } from "@/components/ui/submit-button";
import { generateForCourse } from "../../actions";

export const metadata = { title: "Generate questions" };

export default async function Generate({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  await requireAdmin();
  const supabase = await createClient();
  const { data: courses } = await supabase.from("courses").select("id, name, is_verified, universities(name)").order("name");
  const ai = await getAIProvider();
  return (
    <>
      <PageHeader title="Generate questions with AI" description={<Link href="/admin/questions" className="text-accent">← Question bank</Link>} />
      <FlashMessage searchParams={sp} />
      {!ai && <div className="mb-6 max-w-2xl"><Notice tone="warn" title="AI is not configured">Set ANTHROPIC_API_KEY on the server to enable generation. Nothing will be generated until then.</Notice></div>}
      <Card className="p-5 max-w-2xl">
        <p className="text-sm text-muted mb-5">Generated questions use only the course&apos;s verified facts, are checked automatically for invented details, and are saved as pending review for you to edit or approve.</p>
        <form action={generateForCourse} className="grid gap-4">
          <Field label="Course">
            <Select name="course_id" required defaultValue="">
              <option value="" disabled>Choose…</option>
              {courses?.map((c) => <option key={c.id} value={c.id}>{(c.universities as unknown as { name: string }).name} — {c.name}{c.is_verified ? "" : " (unverified)"}</option>)}
            </Select>
          </Field>
          <Field label="Typical student background (optional)" hint="e.g. BCom graduate, Computer Science BSc. Helps tailor the wording."><Input name="background" maxLength={200} /></Field>
          <Field label="How many"><Input name="count" type="number" min={1} max={10} defaultValue={5} /></Field>
          <SubmitButton disabled={!ai} pendingText="Generating…">Generate for review</SubmitButton>
        </form>
      </Card>
    </>
  );
}
