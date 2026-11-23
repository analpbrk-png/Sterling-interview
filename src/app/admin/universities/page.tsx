"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { must, useLoad } from "@/lib/use-load";
import { useAction } from "@/lib/use-action";
import { setFlash, useFlash } from "@/lib/flash";
import { saveUniversity } from "@/lib/admin/ops";
import { Badge, Button, Card, EmptyState, Field, FlashBar, Input, LoadError, Loading, PageHeader } from "@/components/ui";

export default function Universities() {
  const router = useRouter();
  const [pageFlash] = useFlash();
  const { run, busy, flash } = useAction();
  const { data: unis, error, loading, reload } = useLoad(async () => must(await createClient()
    .from("universities").select("id, name, country, city, is_active, courses(count), interview_templates(id)").order("name")), []);
  if (loading && !unis) return <Loading />;
  if (error || !unis) return <LoadError error={error ?? "Not found"} onRetry={reload} />;
  return (
    <>
      <PageHeader title="Universities" description="Universities, their courses and verified course facts drive which questions students see." />
      <FlashBar flash={flash ?? pageFlash} />
      <Card className="p-5 mb-8">
        <h2 className="font-semibold mb-4">Add university</h2>
        <form onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); void run(async () => { const id = await saveUniversity(f); setFlash({ tone: "ok", text: "University saved." }); router.push(`/admin/universities/view/?id=${id}`); }); }}
          className="grid gap-4 sm:grid-cols-[2fr_1fr_1fr_2fr_auto] sm:items-end">
          <Field label="Name"><Input name="name" required minLength={2} placeholder="University of …" /></Field>
          <Field label="Country"><Input name="country" defaultValue="UK" required /></Field>
          <Field label="City"><Input name="city" /></Field>
          <Field label="Website"><Input name="website" type="url" placeholder="https://" /></Field>
          <Button type="submit" disabled={busy}>Add</Button>
        </form>
      </Card>
      {unis.length ? (
        <Card className="divide-y divide-line">
          {unis.map((u) => (
            <Link key={u.id} href={`/admin/universities/view/?id=${u.id}`} className="flex items-center gap-3 p-4 hover:bg-surface-2/60">
              <div className="min-w-0 flex-1"><p className="font-medium truncate">{u.name}</p><p className="text-sm text-muted">{[u.city, u.country].filter(Boolean).join(", ")}</p></div>
              <Badge>{(u.courses as unknown as { count: number }[])[0]?.count ?? 0} courses</Badge>
              {(u.interview_templates as unknown[]).length ? <Badge tone="accent">Own template</Badge> : null}
              {!u.is_active && <Badge tone="warn">Inactive</Badge>}
            </Link>
          ))}
        </Card>
      ) : <EmptyState title="No universities yet">Add the universities your students apply to.</EmptyState>}
    </>
  );
}
