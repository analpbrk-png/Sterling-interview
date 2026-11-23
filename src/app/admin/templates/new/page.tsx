import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { FlashMessage, PageHeader } from "@/components/ui";
import { TemplateForm } from "@/components/admin/template-form";

export const metadata = { title: "New template" };

export default async function NewTemplate({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  await requireAdmin();
  const supabase = await createClient();
  const { data: universities } = await supabase.from("universities").select("id, name").order("name");
  return (
    <>
      <PageHeader title="New template" description={<Link href="/admin/templates" className="text-accent">← Templates</Link>} />
      <FlashMessage searchParams={sp} />
      <TemplateForm universities={universities ?? []} t={{
        name: "UK CAS Shield Practice", country: "UK", university_id: sp.university ?? null, is_default: false,
        identity_enabled: true, name_id_step_enabled: true, pronunciation_enabled: true, pronunciation_words: ["Hocus-pocus", "Jibber-jabber", "Babbling"],
        declaration_enabled: true, declaration_text: "I confirm that I understand the seriousness of this interview process and acknowledge that any instance of cheating, attempted deception, or fraud on my part will result in the withdrawal of my admission offer.",
        prep_seconds: 20, answer_seconds: 60, submission_mode: "automatic", allow_early_submit: true, question_count: 12, ai_question_count: 4, include_sensitive: false, tts_default: true,
      }} />
    </>
  );
}
