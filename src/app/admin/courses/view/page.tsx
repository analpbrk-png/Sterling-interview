"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { createClient } from "@/lib/supabase/client";
import { maybe, must, useLoad, useParam } from "@/lib/use-load";
import { useAction } from "@/lib/use-action";
import { setFlash, useFlash } from "@/lib/flash";
import { addCourseDetail, deleteCourse, deleteCourseDetail, saveCourse } from "@/lib/admin/ops";
import { CourseDocuments } from "@/components/admin/course-documents";
import { useState } from "react";
import { Badge, Button, Card, Checkbox, Field, FlashBar, Input, LoadError, Loading, Notice, PageHeader, Select, Textarea } from "@/components/ui";

export default function CoursePage() {
  const id = useParam("id");
  const { user } = useAuth();
  const router = useRouter();
  const [pageFlash] = useFlash();
  const { run, busy, flash } = useAction();
  const [extraModules, setExtraModules] = useState<string[]>([]);
  const { data, error, loading, reload } = useLoad(async () => {
    if (!id) return null;
    const s = createClient();
    const [c, details] = await Promise.all([
      s.from("courses").select("*, universities(id, name)").eq("id", id).maybeSingle(),
      s.from("university_course_details").select("*").eq("course_id", id).order("created_at"),
    ]);
    return { c: maybe(c), details: must(details) };
  }, [id]);
  if (id === undefined || (loading && !data)) return <Loading />;
  if (error || !data?.c) return <LoadError error={error ?? "Course not found."} />;
  const { c, details } = data;
  const uni = c.universities as unknown as { id: string; name: string };
  return (
    <>
      <PageHeader title={c.name} description={<Link href={`/admin/universities/view/?id=${uni.id}`} className="inline-flex items-center gap-1 text-sm font-medium text-accent-fg hover:underline">← {uni.name}</Link>} />
      <FlashBar flash={flash ?? pageFlash} />
      <div className="mb-6"><Notice>The AI only uses course modules and details when they are marked <strong>verified</strong>. Unverified data is never presented to students as fact.</Notice></div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-5 sm:p-6 h-fit">
          <form key={c.updated_at} onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); void run(async () => { await saveCourse(f, user!.id); await reload(); return "Course saved."; }); }} className="grid gap-4">
            <input type="hidden" name="id" value={c.id} />
            <input type="hidden" name="university_id" value={uni.id} />
            <Field label="Name"><Input name="name" defaultValue={c.name} required /></Field>
            <Field label="Level"><Input name="level" defaultValue={c.level ?? ""} /></Field>
            <Field label="Official course link"><Input name="official_url" type="url" defaultValue={c.official_url ?? ""} /></Field>
            <Field label="Description"><Textarea name="description" rows={4} defaultValue={c.description ?? ""} /></Field>
            <Field label="Modules" hint="One module per line, exactly as on the official course page."><Textarea key={extraModules.join("|")} name="modules" rows={6} defaultValue={[...c.modules, ...extraModules.filter((m) => !c.modules.includes(m))].join("\n")} /></Field>
            <Checkbox name="is_verified" label="Information verified against the official source" defaultChecked={c.is_verified} hint={c.verified_at ? `Last verified ${new Date(c.verified_at).toLocaleDateString("en-GB")}` : undefined} />
            <Checkbox name="is_active" label="Active (students can choose it)" defaultChecked={c.is_active} />
            <Button type="submit" disabled={busy}>Save course</Button>
          </form>
          <Button className="mt-4" variant="danger" disabled={busy} onClick={() => window.confirm("Delete this course?") && void run(async () => { await deleteCourse(c.id); setFlash({ tone: "ok", text: "Course deleted." }); router.push(`/admin/universities/view/?id=${uni.id}`); })}>Delete course</Button>
        </Card>
        <div className="grid gap-6 content-start">
          <CourseDocuments courseId={c.id} officialUrl={c.official_url} onAddModules={(m) => setExtraModules(m)} />
          <Card className="divide-y divide-line">
            <div className="p-4"><h2 className="font-display text-[17px] font-semibold">Course facts</h2><p className="text-sm text-muted">Campus, facilities, assessment, teaching approach.</p></div>
            {details.length ? details.map((d) => (
              <div key={d.id} className="p-4 flex gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex gap-2 mb-1"><Badge>{d.kind.replace("_", " ")}</Badge>{d.is_verified ? <Badge tone="ok">Verified</Badge> : <Badge tone="warn">Unverified</Badge>}</div>
                  <p className="text-sm text-ink-2 whitespace-pre-wrap">{d.content}</p>
                  {d.source_url && <a href={d.source_url} className="text-xs text-accent-fg break-all" target="_blank" rel="noreferrer">{d.source_url}</a>}
                </div>
                <Button variant="ghost" disabled={busy} onClick={() => window.confirm("Remove this detail?") && void run(async () => { await deleteCourseDetail(d.id); await reload(); return "Detail removed."; })}>Remove</Button>
              </div>
            )) : <p className="p-4 text-sm text-muted">No facts yet.</p>}
          </Card>
          <Card className="p-5 sm:p-6">
            <h2 className="font-display text-[17px] font-semibold mb-4">Add fact</h2>
            <form onSubmit={(e) => { e.preventDefault(); const el = e.currentTarget; const f = new FormData(el); void run(async () => { await addCourseDetail(f); el.reset(); await reload(); return "Detail added."; }); }} className="grid gap-4">
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
              <Button type="submit" disabled={busy}>Add fact</Button>
            </form>
          </Card>
        </div>
      </div>
    </>
  );
}
