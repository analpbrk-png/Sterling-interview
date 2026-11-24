"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { createClient } from "@/lib/supabase/client";
import { maybe, must, useLoad, useParam } from "@/lib/use-load";
import { useAction } from "@/lib/use-action";
import { setFlash, useFlash } from "@/lib/flash";
import { deleteUniversity, saveCourse, saveUniversity } from "@/lib/admin/ops";
import { Badge, Button, Card, Checkbox, Field, FlashBar, Input, LinkButton, LoadError, Loading, PageHeader, Textarea } from "@/components/ui";

export default function UniversityPage() {
  const id = useParam("id");
  const { user } = useAuth();
  const router = useRouter();
  const [pageFlash] = useFlash();
  const { run, busy, flash } = useAction();
  const { data, error, loading, reload } = useLoad(async () => {
    if (!id) return null;
    const s = createClient();
    const [u, courses, template] = await Promise.all([
      s.from("universities").select("*").eq("id", id).maybeSingle(),
      s.from("courses").select("id, name, level, is_verified, is_active, modules").eq("university_id", id).order("name"),
      s.from("interview_templates").select("id, name").eq("university_id", id).maybeSingle(),
    ]);
    return { u: maybe(u), courses: must(courses), template: maybe(template) };
  }, [id]);
  if (id === undefined || (loading && !data)) return <Loading />;
  if (error || !data?.u) return <LoadError error={error ?? "University not found."} />;
  const { u, courses, template } = data;
  return (
    <>
      <PageHeader title={u.name} description={<Link href="/admin/universities/" className="inline-flex items-center gap-1 text-sm font-medium text-accent-fg hover:underline">← All universities</Link>}
        actions={template ? <LinkButton variant="secondary" href={`/admin/templates/edit/?id=${template.id}`}>Edit template: {template.name}</LinkButton> : <LinkButton variant="secondary" href={`/admin/templates/edit/?university=${u.id}`}>Create university template</LinkButton>} />
      <FlashBar flash={flash ?? pageFlash} />
      <div className="grid gap-6 lg:grid-cols-[1fr_1.3fr]">
        <Card className="p-5 sm:p-6 h-fit">
          <h2 className="font-display text-[17px] font-semibold mb-4">Profile</h2>
          <form onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); void run(async () => { await saveUniversity(f); await reload(); return "University saved."; }); }} className="grid gap-4">
            <input type="hidden" name="id" value={u.id} />
            <Field label="Name"><Input name="name" defaultValue={u.name} required /></Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Country"><Input name="country" defaultValue={u.country} required /></Field>
              <Field label="City"><Input name="city" defaultValue={u.city ?? ""} /></Field>
            </div>
            <Field label="Website"><Input name="website" type="url" defaultValue={u.website ?? ""} /></Field>
            <Field label="Admin notes"><Textarea name="notes" rows={2} defaultValue={u.notes ?? ""} /></Field>
            <Checkbox name="is_active" label="Active (students can choose it)" defaultChecked={u.is_active} />
            <Button type="submit" disabled={busy}>Save</Button>
          </form>
          <Button className="mt-4" variant="danger" disabled={busy} onClick={() => window.confirm("Delete this university and all its courses?") && void run(async () => { await deleteUniversity(u.id); setFlash({ tone: "ok", text: "University deleted." }); router.push("/admin/universities/"); })}>Delete university</Button>
        </Card>
        <div className="grid gap-6 content-start">
          <Card className="divide-y divide-line">
            <div className="p-4"><h2 className="font-display text-[17px] font-semibold">Courses</h2></div>
            {courses.length ? courses.map((c) => (
              <Link key={c.id} href={`/admin/courses/view/?id=${c.id}`} className="flex items-center gap-3 p-4 hover:bg-surface-2/60">
                <div className="min-w-0 flex-1"><p className="font-medium truncate">{c.name}</p><p className="text-sm text-muted">{c.level ?? "Level not set"} · {c.modules.length} modules</p></div>
                {c.is_verified ? <Badge tone="ok">Verified</Badge> : <Badge tone="warn">Unverified</Badge>}
                {!c.is_active && <Badge>Inactive</Badge>}
              </Link>
            )) : <p className="p-4 text-sm text-muted">No courses yet.</p>}
          </Card>
          <Card className="p-5 sm:p-6">
            <h2 className="font-display text-[17px] font-semibold mb-4">Add course</h2>
            <form onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); void run(async () => { const cid = await saveCourse(f, user!.id); setFlash({ tone: "ok", text: "Course saved." }); router.push(`/admin/courses/view/?id=${cid}`); }); }} className="grid gap-4">
              <input type="hidden" name="university_id" value={u.id} />
              <div className="grid sm:grid-cols-[2fr_1fr] gap-4">
                <Field label="Course name"><Input name="name" required placeholder="MSc Business Analytics" /></Field>
                <Field label="Level"><Input name="level" placeholder="Postgraduate" /></Field>
              </div>
              <Field label="Official course link"><Input name="official_url" type="url" placeholder="https://" /></Field>
              <Button type="submit" disabled={busy}>Add course</Button>
            </form>
          </Card>
        </div>
      </div>
    </>
  );
}
