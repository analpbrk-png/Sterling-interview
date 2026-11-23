import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Badge, Card, Checkbox, Field, FlashMessage, Input, Notice, PageHeader, Select, Textarea } from "@/components/ui";
import { ConfirmSubmit, SubmitButton } from "@/components/ui/submit-button";
import { addCourseDetail, deleteCourse, deleteCourseDetail, saveCourse } from "../../actions";

export default async function CoursePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  await requireAdmin();
  const supabase = await createClient();
  const [{ data: c }, { data: details }] = await Promise.all([
    supabase.from("courses").select("*, universities(id, name)").eq("id", id).maybeSingle(),
    supabase.from("university_course_details").select("*").eq("course_id", id).order("created_at"),
  ]);
  if (!c) notFound();
  const uni = c.universities as unknown as { id: string; name: string };
  return (
    <>
      <PageHeader title={c.name} description={<Link href={`/admin/universities/${uni.id}`} className="text-accent">← {uni.name}</Link>} />
      <FlashMessage searchParams={sp} />
      <div className="mb-6"><Notice>The AI only uses course modules and details when they are marked <strong>verified</strong>. Unverified data is never presented to students as fact.</Notice></div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-5 h-fit">
          <form action={saveCourse} className="grid gap-4">
            <input type="hidden" name="id" value={c.id} />
            <input type="hidden" name="university_id" value={uni.id} />
            <Field label="Name"><Input name="name" defaultValue={c.name} required /></Field>
            <Field label="Level"><Input name="level" defaultValue={c.level ?? ""} /></Field>
            <Field label="Official course link"><Input name="official_url" type="url" defaultValue={c.official_url ?? ""} /></Field>
            <Field label="Description"><Textarea name="description" rows={4} defaultValue={c.description ?? ""} /></Field>
            <Field label="Modules" hint="One module per line, exactly as on the official course page."><Textarea name="modules" rows={6} defaultValue={c.modules.join("\n")} /></Field>
            <Checkbox name="is_verified" label="Information verified against the official source" defaultChecked={c.is_verified} hint={c.verified_at ? `Last verified ${new Date(c.verified_at).toLocaleDateString("en-GB")}` : undefined} />
            <Checkbox name="is_active" label="Active (students can choose it)" defaultChecked={c.is_active} />
            <SubmitButton>Save course</SubmitButton>
          </form>
          <form action={deleteCourse} className="mt-4">
            <input type="hidden" name="id" value={c.id} />
            <input type="hidden" name="university_id" value={uni.id} />
            <ConfirmSubmit variant="danger" message="Delete this course?">Delete course</ConfirmSubmit>
          </form>
        </Card>
        <div className="grid gap-6 content-start">
          <Card className="divide-y divide-line">
            <div className="p-4"><h2 className="font-semibold">Course facts</h2><p className="text-sm text-muted">Campus, facilities, assessment, teaching approach.</p></div>
            {details?.length ? details.map((d) => (
              <div key={d.id} className="p-4 flex gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex gap-2 mb-1"><Badge>{d.kind.replace("_", " ")}</Badge>{d.is_verified ? <Badge tone="ok">Verified</Badge> : <Badge tone="warn">Unverified</Badge>}</div>
                  <p className="text-sm text-ink-2 whitespace-pre-wrap">{d.content}</p>
                  {d.source_url && <a href={d.source_url} className="text-xs text-accent break-all" target="_blank" rel="noreferrer">{d.source_url}</a>}
                </div>
                <form action={deleteCourseDetail}><input type="hidden" name="id" value={d.id} /><input type="hidden" name="course_id" value={c.id} /><ConfirmSubmit variant="ghost" message="Remove this detail?">Remove</ConfirmSubmit></form>
              </div>
            )) : <p className="p-4 text-sm text-muted">No facts yet.</p>}
          </Card>
          <Card className="p-5">
            <h2 className="font-semibold mb-4">Add fact</h2>
            <form action={addCourseDetail} className="grid gap-4">
              <input type="hidden" name="course_id" value={c.id} />
              <Field label="Type">
                <Select name="kind" defaultValue="campus">
                  <option value="campus">Campus</option><option value="facilities">Facilities</option><option value="assessment">Assessment</option>
                  <option value="teaching">Teaching approach</option><option value="entry_requirements">Entry requirements</option><option value="other">Other</option>
                </Select>
              </Field>
              <Field label="Detail"><Textarea name="content" rows={3} required /></Field>
              <Field label="Source link"><Input name="source_url" type="url" placeholder="https://" /></Field>
              <Checkbox name="is_verified" label="Verified against the official source" />
              <SubmitButton>Add fact</SubmitButton>
            </form>
          </Card>
        </div>
      </div>
    </>
  );
}
