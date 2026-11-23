"use client";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { must, useLoad } from "@/lib/use-load";
import { useFlash } from "@/lib/flash";
import { Badge, Card, EmptyState, FlashBar, LinkButton, LoadError, Loading, PageHeader } from "@/components/ui";

export default function Templates() {
  const [pageFlash] = useFlash();
  const { data: ts, error, loading, reload } = useLoad(async () => must(await createClient().from("interview_templates")
    .select("id, name, country, is_default, prep_seconds, answer_seconds, submission_mode, question_count, ai_question_count, universities(name)").order("name")), []);
  if (loading && !ts) return <Loading />;
  if (error || !ts) return <LoadError error={error ?? "Not found"} onRetry={reload} />;
  return (
    <>
      <PageHeader title="Interview templates" description="Timing, submission mode, intro steps and question mix. University templates override the country default." actions={<LinkButton href="/admin/templates/edit/">New template</LinkButton>} />
      <FlashBar flash={pageFlash} />
      {ts.length ? (
        <Card className="divide-y divide-line">
          {ts.map((t) => (
            <Link key={t.id} href={`/admin/templates/edit/?id=${t.id}`} className="flex flex-wrap items-center gap-3 p-4 hover:bg-surface-2/60">
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
