import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Badge, Card, Checkbox, Field, FlashMessage, Input, LinkButton, PageHeader, Textarea } from "@/components/ui";
import { ConfirmSubmit, SubmitButton } from "@/components/ui/submit-button";
import { deleteUniversity, saveCourse, saveUniversity } from "../../actions";

export default async function UniversityPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  await requireAdmin();
  const supabase = await createClient();
  const [{ data: u }, { data: courses }, { data: template }] = await Promise.all([
    supabase.from("universities").select("*").eq("id", id).maybeSingle(),
    supabase.from("courses").select("id, name, level, is_verified, is_active, modules").eq("university_id", id).order("name"),
    supabase.from("interview_templates").select("id, name").eq("university_id", id).maybeSingle(),
  ]);
  if (!u) notFound();
  return (
    <>
      <PageHeader title={u.name} description={<Link href="/admin/universities" className="text-accent">← All universities</Link>}
        actions={template ? <LinkButton variant="secondary" href={`/admin/templates/${template.id}`}>Edit template: {template.name}</LinkButton> : <LinkButton variant="secondary" href={`/admin/templates/new?university=${id}`}>Create university template</LinkButton>} />
      <FlashMessage searchParams={sp} />
      <div className="grid gap-6 lg:grid-cols-[1fr_1.3fr]">
        <Card className="p-5 h-fit">
          <h2 className="font-semibold mb-4">Profile</h2>
          <form action={saveUniversity} className="grid gap-4">
            <input type="hidden" name="id" value={u.id} />
            <Field label="Name"><Input name="name" defaultValue={u.name} required /></Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Country"><Input name="country" defaultValue={u.country} required /></Field>
              <Field label="City"><Input name="city" defaultValue={u.city ?? ""} /></Field>
            </div>
            <Field label="Website"><Input name="website" type="url" defaultValue={u.website ?? ""} /></Field>
            <Field label="Admin notes"><Textarea name="notes" rows={2} defaultValue={u.notes ?? ""} /></Field>
            <Checkbox name="is_active" label="Active (students can choose it)" defaultChecked={u.is_active} />
            <SubmitButton>Save</SubmitButton>
          </form>
          <form action={deleteUniversity} className="mt-4">
            <input type="hidden" name="id" value={u.id} />
            <ConfirmSubmit variant="danger" message="Delete this university and all its courses?">Delete university</ConfirmSubmit>
          </form>
        </Card>
        <div className="grid gap-6 content-start">
          <Card className="divide-y divide-line">
            <div className="p-4"><h2 className="font-semibold">Courses</h2></div>
            {courses?.length ? courses.map((c) => (
              <Link key={c.id} href={`/admin/courses/${c.id}`} className="flex items-center gap-3 p-4 hover:bg-surface-2/60">
                <div className="min-w-0 flex-1"><p className="font-medium truncate">{c.name}</p><p className="text-sm text-muted">{c.level ?? "Level not set"} · {c.modules.length} modules</p></div>
                {c.is_verified ? <Badge tone="ok">Verified</Badge> : <Badge tone="warn">Unverified</Badge>}
                {!c.is_active && <Badge>Inactive</Badge>}
              </Link>
            )) : <p className="p-4 text-sm text-muted">No courses yet.</p>}
          </Card>
          <Card className="p-5">
            <h2 className="font-semibold mb-4">Add course</h2>
            <form action={saveCourse} className="grid gap-4">
              <input type="hidden" name="university_id" value={u.id} />
              <div className="grid sm:grid-cols-[2fr_1fr] gap-4">
                <Field label="Course name"><Input name="name" required placeholder="MSc Business Analytics" /></Field>
                <Field label="Level"><Input name="level" placeholder="Postgraduate" /></Field>
              </div>
              <Field label="Official course link"><Input name="official_url" type="url" placeholder="https://" /></Field>
              <SubmitButton>Add course</SubmitButton>
            </form>
          </Card>
        </div>
      </div>
    </>
  );
}
