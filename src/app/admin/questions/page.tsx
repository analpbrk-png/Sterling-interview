"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { createClient } from "@/lib/supabase/client";
import { must, useLoad } from "@/lib/use-load";
import { useAction } from "@/lib/use-action";
import { useFlash } from "@/lib/flash";
import { bulkReview } from "@/lib/admin/ops";
import { Badge, Button, Card, EmptyState, FlashBar, LinkButton, LoadError, Loading, PageHeader, Select } from "@/components/ui";

const STATUS_TONE = { pending_review: "warn", approved: "ok", rejected: "danger" } as const;
type Filters = { status: string; category: string; origin: string; active: string; sensitive: string };
const EMPTY: Filters = { status: "", category: "", origin: "", active: "", sensitive: "" };

export default function Questions() {
  const { user } = useAuth();
  const [pageFlash] = useFlash();
  const { run, busy, flash } = useAction();
  const [filters, setFilters] = useState<Filters | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
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
    return { rows: must(rows), categories: must(categories), sources: must(sources), imported: must(imported) };
  }, [JSON.stringify(filters)]);

  if (!filters || (loading && !data)) return <Loading />;
  if (error || !data) return <LoadError error={error ?? "Not found"} onRetry={reload} />;
  const { rows, categories, sources, imported } = data;
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
      <PageHeader title="Question bank" description="Imported, manual and AI-generated questions. Nothing reaches students until it is approved and active."
        actions={<>
          <LinkButton href="/admin/questions/import/" variant="secondary">Import PDF</LinkButton>
          <LinkButton href="/admin/questions/generate/" variant="secondary">Generate with AI</LinkButton>
          <LinkButton href="/admin/questions/preview/" variant="secondary">Preview sequence</LinkButton>
          <LinkButton href="/admin/questions/edit/">Add question</LinkButton>
        </>} />
      <FlashBar flash={flash ?? pageFlash} />
      {sources.length > 0 && (
        <Card className="mb-6 p-4 overflow-x-auto">
          <p className="font-medium text-sm mb-2">Imported from PDFs (every page read; original wording kept)</p>
          <table className="w-full text-sm">
            <thead className="text-left text-muted"><tr>{["File", "Pages", "Questions", "Intro steps", "Approved", "Duplicates (kept)"].map((h) => <th key={h} className="py-1 pr-4 font-medium">{h}</th>)}</tr></thead>
            <tbody>
              {sources.map((src) => {
                const items = imported.filter((i) => i.source_file === src.file_name);
                return (
                  <tr key={src.file_name}>
                    <td className="py-1 pr-4">{src.file_name}</td><td className="pr-4">{src.page_count}</td>
                    <td className="pr-4">{items.filter((i) => i.question_type === "question").length}</td>
                    <td className="pr-4">{items.filter((i) => i.question_type !== "question").length}</td>
                    <td className="pr-4">{items.filter((i) => i.review_status === "approved").length}</td>
                    <td>{items.filter((i) => i.duplicate_of).length}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
      <form className="mb-5 grid gap-3 grid-cols-2 sm:grid-cols-[repeat(5,minmax(0,1fr))_auto] items-end" onSubmit={(e) => { e.preventDefault(); apply(Object.fromEntries(new FormData(e.currentTarget)) as Filters); }}>
        <Select name="status" defaultValue={filters.status} aria-label="Status"><option value="">Any status</option><option value="pending_review">Pending review</option><option value="approved">Approved</option><option value="rejected">Rejected</option></Select>
        <Select name="category" defaultValue={filters.category} aria-label="Category"><option value="">Any category</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
        <Select name="origin" defaultValue={filters.origin} aria-label="Origin"><option value="">Any origin</option><option value="imported">Imported</option><option value="manual">Manual</option><option value="ai_generated">AI generated</option></Select>
        <Select name="active" defaultValue={filters.active} aria-label="Active"><option value="">Active or not</option><option value="1">Active only</option></Select>
        <Select name="sensitive" defaultValue={filters.sensitive} aria-label="Sensitive"><option value="">Any sensitivity</option><option value="1">Sensitive only</option></Select>
        <Button variant="secondary" type="submit">Filter</Button>
      </form>
      {rows.length ? (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
            <label className="flex items-center gap-2 text-muted mr-2"><input type="checkbox" className="h-4 w-4 accent-[var(--accent)]" checked={allSelected} onChange={() => setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)))} />{rows.length} shown · {selected.size} selected</label>
            <Button disabled={busy || !selected.size} onClick={() => act("approve")}>Approve &amp; activate</Button>
            <Button variant="secondary" disabled={busy || !selected.size} onClick={() => act("reject")}>Reject</Button>
            <Button variant="secondary" disabled={busy || !selected.size} onClick={() => act("deactivate")}>Deactivate</Button>
          </div>
          <Card className="divide-y divide-line">
            {rows.map((r) => (
              <div key={r.id} className="flex gap-3 p-4">
                <input type="checkbox" aria-label="Select" className="mt-1 h-4 w-4 accent-[var(--accent)]" checked={selected.has(r.id)}
                  onChange={() => setSelected((s) => { const n = new Set(s); if (n.has(r.id)) n.delete(r.id); else n.add(r.id); return n; })} />
                <div className="min-w-0 flex-1">
                  <Link href={`/admin/questions/edit/?id=${r.id}`} className="font-medium text-ink hover:text-accent">{r.question_text}</Link>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <Badge tone={STATUS_TONE[r.review_status as keyof typeof STATUS_TONE]}>{r.review_status.replace("_", " ")}</Badge>
                    {r.is_active && <Badge tone="accent">Active</Badge>}
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
      ) : <EmptyState title="No questions match">Try other filters, import a PDF or add a question.</EmptyState>}
    </>
  );
}
