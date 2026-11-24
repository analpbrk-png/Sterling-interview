"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { BadgeCheck, BookOpen, Building2, GraduationCap, Search } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { must, useLoad } from "@/lib/use-load";
import { useFlash } from "@/lib/flash";
import { Badge, Card, EmptyState, FlashBar, Input, LinkButton, LoadError, Loading, PageHeader, Select } from "@/components/ui";

type CourseRow = { id: string; name: string; modules: string[] | null; is_verified: boolean; is_active: boolean; universities: { id: string; name: string; country: string } | null };

export default function Courses() {
  const [pageFlash] = useFlash();
  const [q, setQ] = useState("");
  const [uni, setUni] = useState("");
  const { data, error, loading, reload } = useLoad(async () =>
    must(await createClient().from("courses").select("id, name, modules, is_verified, is_active, universities(id, name, country)").order("name")) as unknown as CourseRow[], []);
  const list = useMemo(() => (data ?? []).filter((c) =>
    (!q || `${c.name} ${c.universities?.name ?? ""}`.toLowerCase().includes(q.toLowerCase())) && (!uni || c.universities?.id === uni)), [data, q, uni]);
  if (loading && !data) return <Loading />;
  if (error || !data) return <LoadError error={error ?? "Not found"} onRetry={reload} />;
  const unis = [...new Map(data.filter((c) => c.universities).map((c) => [c.universities!.id, c.universities!.name])).entries()];
  return (
    <>
      <PageHeader eyebrow="Content" title="Courses" description="Courses, verified modules and reference documents used for course-specific questions."
        actions={<LinkButton variant="secondary" href="/admin/universities/"><Building2 /> Add via university</LinkButton>} />
      <FlashBar flash={pageFlash} />
      <div className="mb-5 grid gap-3 sm:grid-cols-[2fr_1fr]">
        <div className="relative"><Search aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-muted" /><Input className="pl-10" placeholder="Search courses" aria-label="Search courses" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <Select aria-label="University" value={uni} onChange={(e) => setUni(e.target.value)}><option value="">All universities</option>{unis.map(([id, n]) => <option key={id} value={id}>{n}</option>)}</Select>
      </div>
      {list.length ? (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((c) => (
            <li key={c.id}>
              <Link href={`/admin/courses/view/?id=${c.id}`} className="block h-full">
                <Card className="h-full p-5 grid gap-4 transition hover:-translate-y-0.5 hover:border-line-strong">
                  <div className="flex items-start gap-3">
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent-fg"><GraduationCap className="size-5" strokeWidth={1.8} /></span>
                    <div className="min-w-0">
                      <p className="font-display font-semibold text-[16px] leading-snug">{c.name}</p>
                      <p className="text-sm text-muted truncate">{c.universities?.name}{c.universities?.country ? ` · ${c.universities.country}` : ""}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5 mt-auto">
                    <Badge><BookOpen className="size-3" /> {(c.modules ?? []).length} modules</Badge>
                    {c.is_verified ? <Badge tone="ok"><BadgeCheck className="size-3" /> Verified</Badge> : <Badge tone="warn">Unverified</Badge>}
                    {!c.is_active && <Badge tone="danger">Inactive</Badge>}
                  </div>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      ) : <EmptyState icon={GraduationCap} title={data.length ? "No courses match" : "No courses yet"}>{data.length ? "Try another search." : "Open a university to add its courses."}</EmptyState>}
    </>
  );
}
