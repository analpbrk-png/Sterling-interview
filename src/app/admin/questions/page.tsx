"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { createClient } from "@/lib/supabase/client";
import { must, useLoad } from "@/lib/use-load";
import { useAction } from "@/lib/use-action";
import { useFlash } from "@/lib/flash";
import { bulkReview } from "@/lib/admin/ops";
import { Badge, Button, Card, EmptyState, FlashBar, Input, LinkButton, LoadError, Loading, PageHeader, ProgressBar, Section, Select, StatCard } from "@/components/ui";
import { Building2, CheckCircle2, FileText, FileUp, Filter, Library, PlayCircle, Plus, Search, Sparkles, Tags } from "lucide-react";

const STATUS_TONE = { pending_review: "warn", approved: "ok", rejected: "danger" } as const;
type Filters = { status: string; category: string; origin: string; active: string; sensitive: string };
const EMPTY: Filters = { status: "", category: "", origin: "", active: "", sensitive: "" };

export default function Questions() {
  const { user } = useAuth();
  const [pageFlash] = useFlash();
  const { run, busy, flash } = useAction();
  const [filters, setFilters] = useState<Filters | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    setFilters({ ...EMPTY, ...Object.fromEntries(Object.keys(EMPTY).map((k) => [k, p.get(k) ?? ""])) });
  }, []);
  const { data, error, loading, reload } = useLoad(async () => {
    if (!filters) return null;
    const s = createClient();
    let q = s.from("question_bank")
      .select("id, question_text, category_id, origin, question_type, source_file, source_page, is_active, review_status, is_sensitive, mentions_university, duplicate_of, applicable_university_ids, created_at")
      .order("source_file", { nullsFirst: false }).order("source_page").order("created_at", { ascending: false }).limit(300);
    if (filters.status) q = q.eq("review_status", filters.status);
    if (filters.category) q = q.eq("category_id", filters.category);
    if (filters.origin) q = q.eq("origin", filters.origin);
    if (filters.active === "1") q = q.eq("is_active", true);
    if (filters.sensitive === "1") q = q.eq("is_sensitive", true);
    const [rows, categories, sources, imported] = await Promise.all([
      q, s.from("question_categories").select("id, name").order("sort_order"),
      s.from("question_sources").select("file_name, page_count").eq("kind", "pdf").order("file_name"),
      s.from("question_bank").select("source_file, question_type, review_status, duplicate_of").eq("origin", "imported"),
    ]);
    const count = async (f: (q: any) => any) => (await f(s.from("question_bank").select("*", { count: "exact", head: true }))).count ?? 0; // eslint-disable-line @typescript-eslint/no-explicit-any
    const [total, importedN, ai, approved, uni] = await Promise.all([
      count((q) => q.eq("question_type", "question").is("invitation_id", null)),
      count((q) => q.eq("origin", "imported")),
      count((q) => q.eq("origin", "ai_generated")),
      count((q) => q.eq("review_status", "approved").eq("question_type", "question").is("invitation_id", null)),
      count((q) => q.neq("applicable_university_ids", "{}")),
    ]);
    return { rows: must(rows), categories: must(categories), sources: must(sources), imported: must(imported), stats: { total, importedN, ai, approved, uni } };
  }, [JSON.stringify(filters)]);

  if (!filters || (loading && !data)) return <Loading />;
  if (error || !data) return <LoadError error={error ?? "Not found"} onRetry={reload} />;
  const { categories, sources, imported, stats } = data;
  const rows = search ? data.rows.filter((r) => r.question_text.toLowerCase().includes(search.toLowerCase())) : data.rows;
  const catName = Object.fromEntries(categories.map((c) => [c.id, c.name]));
  const apply = (f: Filters) => {
    setFilters(f);
    setSelected(new Set());
    const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v) as [string, string][]).toString();
    window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
  };
  const act = (intent: "approve" | "reject" | "deactivate") => void run(async () => {
    const msg = await bulkReview([...selected], intent, user!.id);
    setSelected(new Set());
    await reload();
    return msg;
  });
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));

  return (
    <>
      <PageHeader eyebrow="Content" title="Question bank" description="Imported, manual and AI-generated questions. Nothing reaches students until it is approved and active."
        actions={<>
          <LinkButton href="/admin/questions/import/" variant="secondary"><FileUp /> Import PDF</LinkButton>
          <LinkButton href="/admin/questions/generate/" variant="secondary"><Sparkles /> Generate with AI</LinkButton>
          <LinkButton href="/admin/questions/preview/" variant="ghost"><PlayCircle /> Preview</LinkButton>
          <LinkButton href="/admin/questions/edit/"><Plus /> Add question</LinkButton>
        </>} />
      <FlashBar flash={flash ?? pageFlash} />
      <div className="grid gap-3 grid-cols-2 md:grid-cols-3 2xl:grid-cols-6 mb-6 animate-rise">
        <StatCard label="Total questions" value={stats.total} icon={Library} tone="accent" hint="Shared bank" />
        <StatCard label="PDF-imported" value={stats.importedN} icon={FileText} tone="gold" hint="Incl. intro steps" />
        <StatCard label="AI-generated" value={stats.ai} icon={Sparkles} tone="info" hint="All interviews" />
        <StatCard label="Approved" value={stats.approved} icon={CheckCircle2} tone="ok" hint="Ready to use" />
        <StatCard label="University-specific" value={stats.uni} icon={Building2} tone="neutral" hint="Restricted" />
        <StatCard label="Categories" value={categories.length} icon={Tags} tone="neutral" hint="Question types" />
      </div>
      {sources.length > 0 && (
        <Section className="mb-6" icon={FileText} title="Imported from PDFs" description="Every page read; original wording kept. Duplicates are linked, not deleted.">
          <ul className="grid gap-3 md:grid-cols-3">
            {sources.map((src) => {
              const items = imported.filter((i) => i.source_file === src.file_name);
              const qs = items.filter((i) => i.question_type === "question").length;
              const ok = items.filter((i) => i.review_status === "approved").length;
              return (
                <li key={src.file_name} className="rounded-2xl border border-line bg-surface-2/40 p-4">
                  <p className="font-medium text-sm truncate" title={src.file_name}>{src.file_name}</p>
                  <p className="text-xs text-muted">{src.page_count} pages</p>
                  <div className="mt-3 grid grid-cols-4 gap-2 text-center">
                    {([["Questions", qs], ["Intro", items.length - qs], ["Approved", ok], ["Dupes", items.filter((i) => i.duplicate_of).length]] as const).map(([k, v]) => (
                      <div key={k}><p className="font-display text-lg font-semibold tabular-nums">{v}</p><p className="text-[10.5px] text-muted">{k}</p></div>
                    ))}
                  </div>
                  <ProgressBar className="mt-3" value={items.length ? (ok / items.length) * 100 : 0} tone="ok" label={`${src.file_name} approved`} />
                </li>
              );
            })}
          </ul>
        </Section>
      )}
      <div className="relative mb-3"><Search aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-muted" /><Input className="pl-10" placeholder="Search question text" aria-label="Search questions" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
      <form className="mb-5 grid gap-3 grid-cols-2 sm:grid-cols-[repeat(5,minmax(0,1fr))_auto] items-end" onSubmit={(e) => { e.preventDefault(); apply(Object.fromEntries(new FormData(e.currentTarget)) as Filters); }}>
        <Select name="status" defaultValue={filters.status} aria-label="Status"><option value="">Any status</option><option value="pending_review">Pending review</option><option value="approved">Approved</option><option value="rejected">Rejected</option></Select>
        <Select name="category" defaultValue={filters.category} aria-label="Category"><option value="">Any category</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
        <Select name="origin" defaultValue={filters.origin} aria-label="Origin"><option value="">Any origin</option><option value="imported">Imported</option><option value="manual">Manual</option><option value="ai_generated">AI generated</option></Select>
        <Select name="active" defaultValue={filters.active} aria-label="Active"><option value="">Active or not</option><option value="1">Active only</option></Select>
        <Select name="sensitive" defaultValue={filters.sensitive} aria-label="Sensitive"><option value="">Any sensitivity</option><option value="1">Sensitive only</option></Select>
        <Button variant="secondary" type="submit"><Filter /> Filter</Button>
      </form>
      {rows.length ? (
        <>
          <div className="sticky top-14 lg:top-0 z-10 -mx-1 px-1 py-2 mb-2 bg-bg/90 backdrop-blur flex flex-wrap items-center gap-2 text-sm">
            <label className="flex items-center gap-2 text-muted mr-2"><input type="checkbox" className="h-4 w-4 accent-[var(--accent)]" checked={allSelected} onChange={() => setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)))} />{rows.length} shown · {selected.size} selected</label>
            <Button size="sm" disabled={busy || !selected.size} onClick={() => act("approve")}>Approve &amp; activate</Button>
            <Button size="sm" variant="secondary" disabled={busy || !selected.size} onClick={() => act("reject")}>Reject</Button>
            <Button size="sm" variant="ghost" disabled={busy || !selected.size} onClick={() => act("deactivate")}>Deactivate</Button>
          </div>
          <Card className="divide-y divide-line">
            {rows.map((r) => (
              <div key={r.id} className="flex gap-3 p-4 sm:px-5 hover:bg-surface-2/40 transition-colors">
                <input type="checkbox" aria-label="Select" className="mt-1 h-4 w-4 accent-[var(--accent)]" checked={selected.has(r.id)}
                  onChange={() => setSelected((s) => { const n = new Set(s); if (n.has(r.id)) n.delete(r.id); else n.add(r.id); return n; })} />
                <div className="min-w-0 flex-1">
                  <Link href={`/admin/questions/edit/?id=${r.id}`} className="font-medium text-ink hover:text-accent-fg">{r.question_text}</Link>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <Badge dot tone={STATUS_TONE[r.review_status as keyof typeof STATUS_TONE]}>{r.review_status.replace("_", " ")}</Badge>
                    {r.is_active && <Badge tone="gold">Active</Badge>}
                    <Badge>{catName[r.category_id] ?? r.category_id}</Badge>
                    <Badge>{r.origin === "ai_generated" ? "AI generated" : r.origin}</Badge>
                    {r.question_type !== "question" && <Badge>{r.question_type.replace("_", " ")}</Badge>}
                    {r.is_sensitive && <Badge tone="danger">Sensitive</Badge>}
                    {r.mentions_university && <Badge tone="warn">Names {r.mentions_university}{r.applicable_university_ids.length ? "" : " · applicability needed"}</Badge>}
                    {r.duplicate_of && <Badge tone="warn">Duplicate</Badge>}
                    {r.source_file && <span className="text-xs text-muted self-center">{r.source_file} p.{r.source_page}</span>}
                  </div>
                </div>
              </div>
            ))}
          </Card>
        </>
      ) : <EmptyState icon={Search} title="No questions match">Try other filters, import a PDF or add a question.</EmptyState>}
    </>
  );
}
