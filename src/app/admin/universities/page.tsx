"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { must, useLoad } from "@/lib/use-load";
import { useAction } from "@/lib/use-action";
import { setFlash, useFlash } from "@/lib/flash";
import { saveUniversity } from "@/lib/admin/ops";
import { Badge, Button, Card, EmptyState, Field, FlashBar, Input, LoadError, Loading, PageHeader, Section } from "@/components/ui";
import { Building2, GraduationCap, MapPin, Plus, Search } from "lucide-react";
import { useState } from "react";

export default function Universities() {
  const router = useRouter();
  const [pageFlash] = useFlash();
  const { run, busy, flash } = useAction();
  const [q, setQ] = useState("");
  const { data: unis, error, loading, reload } = useLoad(async () => must(await createClient()
    .from("universities").select("id, name, country, city, is_active, courses(count), interview_templates(id)").order("name")), []);
  if (loading && !unis) return <Loading />;
  if (error || !unis) return <LoadError error={error ?? "Not found"} onRetry={reload} />;
  return (
    <>
      <PageHeader eyebrow="Content" title="Universities" description="Universities, their courses and verified course facts drive which questions students see." />
      <FlashBar flash={flash ?? pageFlash} />
      <Section className="mb-8" icon={Plus} title="Add university">
        <form onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); void run(async () => { const id = await saveUniversity(f); setFlash({ tone: "ok", text: "University saved." }); router.push(`/admin/universities/view/?id=${id}`); }); }}
          className="grid gap-4 sm:grid-cols-[2fr_1fr_1fr_2fr_auto] sm:items-end">
          <Field label="Name"><Input name="name" required minLength={2} placeholder="University of …" /></Field>
          <Field label="Country"><Input name="country" defaultValue="UK" required /></Field>
          <Field label="City"><Input name="city" /></Field>
          <Field label="Website"><Input name="website" type="url" placeholder="https://" /></Field>
          <Button type="submit" disabled={busy}><Plus /> Add</Button>
        </form>
      </Section>
      {unis.length > 0 && <div className="relative mb-4"><Search aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-muted" /><Input className="pl-10" placeholder="Search universities" aria-label="Search universities" value={q} onChange={(e) => setQ(e.target.value)} /></div>}
      {unis.length ? (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {unis.filter((u) => !q || `${u.name} ${u.city ?? ""} ${u.country}`.toLowerCase().includes(q.toLowerCase())).map((u) => (
            <li key={u.id}>
              <Link href={`/admin/universities/view/?id=${u.id}`} className="block h-full">
                <Card className="h-full p-5 grid gap-4 transition hover:-translate-y-0.5 hover:border-line-strong">
                  <div className="flex items-start gap-3">
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gold-gradient text-[#17150f] font-display font-semibold">{u.name.replace(/^University of /i, "").slice(0, 1)}</span>
                    <div className="min-w-0"><p className="font-display font-semibold text-[16px] leading-snug">{u.name}</p><p className="text-sm text-muted flex items-center gap-1"><MapPin className="size-3.5" />{[u.city, u.country].filter(Boolean).join(", ")}</p></div>
                  </div>
                  <div className="flex flex-wrap gap-1.5 mt-auto">
                    <Badge><GraduationCap className="size-3" /> {(u.courses as unknown as { count: number }[])[0]?.count ?? 0} courses</Badge>
                    {(u.interview_templates as unknown[]).length ? <Badge tone="gold">Own template</Badge> : null}
                    {!u.is_active && <Badge tone="warn">Inactive</Badge>}
                  </div>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      ) : <EmptyState icon={Building2} title="No universities yet">Add the universities your students apply to.</EmptyState>}
    </>
  );
}
