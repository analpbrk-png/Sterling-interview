"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BASE_PATH, createClient } from "@/lib/supabase/client";
import { maybe, must, useLoad, useParam } from "@/lib/use-load";
import { useAction } from "@/lib/use-action";
import { setFlash, useFlash } from "@/lib/flash";
import { deleteTemplate, saveTemplate } from "@/lib/admin/ops";
import { Button, FlashBar, LoadError, Loading, PageHeader } from "@/components/ui";
import { TemplateForm, type TemplateValues } from "@/components/admin/template-form";

const DEFAULTS = (university: string | null): TemplateValues => ({
  name: "UK CAS Shield Practice", country: "UK", university_id: university, is_default: false,
  identity_enabled: true, name_id_step_enabled: true, pronunciation_enabled: true, pronunciation_words: ["Hocus-pocus", "Jibber-jabber", "Babbling"],
  declaration_enabled: true, declaration_text: "I confirm that I understand the seriousness of this interview process and acknowledge that any instance of cheating, attempted deception, or fraud on my part will result in the withdrawal of my admission offer.",
  prep_seconds: 20, answer_seconds: 60, submission_mode: "automatic", allow_early_submit: true, question_count: 12, ai_question_count: 4, include_sensitive: false, tts_default: true,
});

export default function EditTemplate() {
  const id = useParam("id");
  const university = useParam("university");
  const router = useRouter();
  const [pageFlash] = useFlash();
  const { run, busy, flash } = useAction();
  const { data, error, loading, reload } = useLoad(async () => {
    if (id === undefined) return null;
    const s = createClient();
    const [t, universities] = await Promise.all([
      id ? s.from("interview_templates").select("*").eq("id", id).maybeSingle() : Promise.resolve({ data: null, error: null }),
      s.from("universities").select("id, name").order("name"),
    ]);
    return { t: maybe(t) as (TemplateValues & { id: string; updated_at: string }) | null, universities: must(universities) };
  }, [id]);
  if (id === undefined || (loading && !data)) return <Loading />;
  if (error || !data || (id && !data.t)) return <LoadError error={error ?? "Template not found."} />;
  const { t, universities } = data;
  const onSave = (form: FormData) => void run(async () => {
    const saved = await saveTemplate(form);
    if (!id) { setFlash({ tone: "ok", text: "Template saved." }); window.location.assign(`${BASE_PATH}/admin/templates/edit/?id=${saved}`); return; }
    await reload();
    return "Template saved.";
  });
  return (
    <>
      <PageHeader title={t?.name ?? "New template"} description={<Link href="/admin/templates/" className="inline-flex items-center gap-1 text-sm font-medium text-accent-fg hover:underline">← Templates</Link>} />
      <FlashBar flash={flash ?? pageFlash} />
      <TemplateForm key={t?.updated_at ?? "new"} t={t ?? DEFAULTS(university ?? null)} universities={universities} onSave={onSave} busy={busy} />
      {t && <Button className="mt-6" variant="danger" disabled={busy} onClick={() => window.confirm("Delete this template?") && void run(async () => { await deleteTemplate(t.id); setFlash({ tone: "ok", text: "Template deleted." }); router.push("/admin/templates/"); })}>Delete template</Button>}
    </>
  );
}
