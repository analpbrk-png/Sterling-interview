import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Badge, Card, EmptyState, FlashMessage, LinkButton, PageHeader } from "@/components/ui";

export const metadata = { title: "Templates" };

export default async function Templates({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  await requireAdmin();
  const supabase = await createClient();
  const { data: ts } = await supabase.from("interview_templates").select("id, name, country, is_default, prep_seconds, answer_seconds, submission_mode, question_count, ai_question_count, universities(name)").order("name");
  return (
    <>
      <PageHeader title="Interview templates" description="Timing, submission mode, intro steps and question mix. University templates override the country default." actions={<LinkButton href="/admin/templates/new">New template</LinkButton>} />
      <FlashMessage searchParams={sp} />
      {ts?.length ? (
        <Card className="divide-y divide-line">
          {ts.map((t) => (
            <Link key={t.id} href={`/admin/templates/${t.id}`} className="flex flex-wrap items-center gap-3 p-4 hover:bg-surface-2/60">
              <div className="min-w-0 flex-1"><p className="font-medium">{t.name}</p><p className="text-sm text-muted">{(t.universities as unknown as { name: string } | null)?.name ?? `${t.country} default`}</p></div>
              {t.is_default && <Badge tone="accent">Default</Badge>}
              <Badge>{t.prep_seconds}s prep</Badge><Badge>{t.answer_seconds}s answer</Badge><Badge>{t.submission_mode}</Badge><Badge>{t.question_count} Q ({t.ai_question_count} AI)</Badge>
            </Link>
          ))}
        </Card>
      ) : <EmptyState title="No templates">Create a default template so students can start interviews.</EmptyState>}
    </>
  );
}
