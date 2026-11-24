"use client";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { must, useLoad } from "@/lib/use-load";
import { useFlash } from "@/lib/flash";
import { Badge, Card, EmptyState, FlashBar, LinkButton, LoadError, Loading, PageHeader } from "@/components/ui";
import { LayoutTemplate, Plus } from "lucide-react";

export default function Templates() {
  const [pageFlash] = useFlash();
  const { data: ts, error, loading, reload } = useLoad(async () => must(await createClient().from("interview_templates")
    .select("id, name, country, is_default, prep_seconds, answer_seconds, submission_mode, question_count, ai_question_count, universities(name)").order("name")), []);
  if (loading && !ts) return <Loading />;
  if (error || !ts) return <LoadError error={error ?? "Not found"} onRetry={reload} />;
  return (
    <>
      <PageHeader eyebrow="Content" title="Interview templates" description="Timing, submission mode, intro steps and question mix. University templates override the country default." actions={<LinkButton href="/admin/templates/edit/"><Plus /> New template</LinkButton>} />
      <FlashBar flash={pageFlash} />
      {ts.length ? (
        <ul className="grid gap-4 md:grid-cols-2">
          {ts.map((t) => (
            <li key={t.id}>
              <Link href={`/admin/templates/edit/?id=${t.id}`} className="block h-full">
                <Card className="h-full p-5 grid gap-4 transition hover:-translate-y-0.5 hover:border-line-strong">
                  <div className="flex items-start gap-3">
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent-fg"><LayoutTemplate className="size-5" strokeWidth={1.8} /></span>
                    <div className="min-w-0 flex-1"><p className="font-display font-semibold text-[16px]">{t.name}</p><p className="text-sm text-muted">{(t.universities as unknown as { name: string } | null)?.name ?? `${t.country} default`}</p></div>
                    {t.is_default && <Badge tone="gold" dot>Default</Badge>}
                  </div>
                  <div className="grid grid-cols-3 gap-2 rounded-xl bg-surface-2/60 p-3 text-center">
                    <div><p className="font-display text-lg font-semibold tabular-nums">{t.prep_seconds}s</p><p className="text-[11px] text-muted">Preparation</p></div>
                    <div><p className="font-display text-lg font-semibold tabular-nums">{t.answer_seconds}s</p><p className="text-[11px] text-muted">Answer</p></div>
                    <div><p className="font-display text-lg font-semibold tabular-nums">{t.question_count}</p><p className="text-[11px] text-muted">Questions</p></div>
                  </div>
                  <div className="flex flex-wrap gap-1.5"><Badge>{t.submission_mode} submission</Badge><Badge>{t.ai_question_count} AI</Badge></div>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      ) : <EmptyState icon={LayoutTemplate} title="No templates">Create a default template so students can start interviews.</EmptyState>}
    </>
  );
}
