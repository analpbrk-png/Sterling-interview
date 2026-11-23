import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Badge, Card, EmptyState, FlashMessage, LinkButton, PageHeader, Select, Button } from "@/components/ui";
import { SubmitButton } from "@/components/ui/submit-button";
import { bulkReview } from "../actions";

export const metadata = { title: "Questions" };

const STATUS_TONE = { pending_review: "warn", approved: "ok", rejected: "danger" } as const;

export default async function Questions({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  await requireAdmin();
  const supabase = await createClient();
  let q = supabase
    .from("question_bank")
    .select("id, question_text, category_id, origin, question_type, source_file, source_page, is_active, review_status, is_sensitive, mentions_university, duplicate_of, similarity_group, applicable_university_ids, created_at")
    .order("source_file", { nullsFirst: false })
    .order("source_page")
    .order("created_at", { ascending: false })
    .limit(300);
  if (sp.status) q = q.eq("review_status", sp.status);
  if (sp.category) q = q.eq("category_id", sp.category);
  if (sp.origin) q = q.eq("origin", sp.origin);
  if (sp.active === "1") q = q.eq("is_active", true);
  if (sp.sensitive === "1") q = q.eq("is_sensitive", true);
  const [{ data: rows }, { data: categories }] = await Promise.all([q, supabase.from("question_categories").select("id, name").order("sort_order")]);
  const catName = Object.fromEntries((categories ?? []).map((c) => [c.id, c.name]));
  const back = `/admin/questions?${new URLSearchParams(Object.fromEntries(Object.entries(sp).filter(([k]) => !["saved", "error"].includes(k)))).toString()}`;

  return (
    <>
      <PageHeader title="Question bank" description="Imported, manual and AI-generated questions. Nothing reaches students until it is approved and active."
        actions={<>
          <LinkButton href="/admin/questions/import" variant="secondary">Import PDF</LinkButton>
          <LinkButton href="/admin/questions/generate" variant="secondary">Generate with AI</LinkButton>
          <LinkButton href="/admin/questions/preview" variant="secondary">Preview sequence</LinkButton>
          <LinkButton href="/admin/questions/new">Add question</LinkButton>
        </>} />
      <FlashMessage searchParams={sp} />
      <form className="mb-5 grid gap-3 grid-cols-2 sm:grid-cols-[repeat(5,minmax(0,1fr))_auto] items-end" method="get">
        <Select name="status" defaultValue={sp.status ?? ""} aria-label="Status"><option value="">Any status</option><option value="pending_review">Pending review</option><option value="approved">Approved</option><option value="rejected">Rejected</option></Select>
        <Select name="category" defaultValue={sp.category ?? ""} aria-label="Category"><option value="">Any category</option>{categories?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
        <Select name="origin" defaultValue={sp.origin ?? ""} aria-label="Origin"><option value="">Any origin</option><option value="imported">Imported</option><option value="manual">Manual</option><option value="ai_generated">AI generated</option></Select>
        <Select name="active" defaultValue={sp.active ?? ""} aria-label="Active"><option value="">Active or not</option><option value="1">Active only</option></Select>
        <Select name="sensitive" defaultValue={sp.sensitive ?? ""} aria-label="Sensitive"><option value="">Any sensitivity</option><option value="1">Sensitive only</option></Select>
        <Button variant="secondary" type="submit">Filter</Button>
      </form>
      {rows?.length ? (
        <form action={bulkReview}>
          <input type="hidden" name="back" value={back} />
          <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted mr-2">{rows.length} shown · with selected:</span>
            <SubmitButton name="intent" value="approve" pendingText="Working…">Approve &amp; activate</SubmitButton>
            <SubmitButton name="intent" value="reject" variant="secondary" pendingText="Working…">Reject</SubmitButton>
            <SubmitButton name="intent" value="deactivate" variant="secondary" pendingText="Working…">Deactivate</SubmitButton>
          </div>
          <Card className="divide-y divide-line">
            {rows.map((r) => (
              <div key={r.id} className="flex gap-3 p-4">
                <input type="checkbox" name="ids" value={r.id} aria-label="Select" className="mt-1 h-4 w-4 accent-[var(--accent)]" />
                <div className="min-w-0 flex-1">
                  <Link href={`/admin/questions/${r.id}`} className="font-medium text-ink hover:text-accent">{r.question_text}</Link>
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
        </form>
      ) : <EmptyState title="No questions match">Try other filters, import a PDF or add a question.</EmptyState>}
    </>
  );
}
