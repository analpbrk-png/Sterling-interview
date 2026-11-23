import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { FlashMessage, PageHeader } from "@/components/ui";
import { ConfirmSubmit } from "@/components/ui/submit-button";
import { TemplateForm } from "@/components/admin/template-form";
import { deleteTemplate } from "../../actions";

export default async function EditTemplate({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  await requireAdmin();
  const supabase = await createClient();
  const [{ data: t }, { data: universities }] = await Promise.all([
    supabase.from("interview_templates").select("*").eq("id", id).maybeSingle(),
    supabase.from("universities").select("id, name").order("name"),
  ]);
  if (!t) notFound();
  return (
    <>
      <PageHeader title={t.name} description={<Link href="/admin/templates" className="text-accent">← Templates</Link>} />
      <FlashMessage searchParams={sp} />
      <TemplateForm t={t} universities={universities ?? []} />
      <form action={deleteTemplate} className="mt-6"><input type="hidden" name="id" value={t.id} /><ConfirmSubmit variant="danger" message="Delete this template?">Delete template</ConfirmSubmit></form>
    </>
  );
}
