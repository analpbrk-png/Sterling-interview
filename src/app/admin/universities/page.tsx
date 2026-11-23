import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Badge, Card, EmptyState, Field, FlashMessage, Input, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/ui/submit-button";
import { saveUniversity } from "../actions";

export const metadata = { title: "Universities" };

export default async function Universities({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  await requireAdmin();
  const supabase = await createClient();
  const { data: unis } = await supabase.from("universities").select("id, name, country, city, is_active, courses(count), interview_templates(id)").order("name");
  return (
    <>
      <PageHeader title="Universities" description="Universities, their courses and verified course facts drive which questions students see." />
      <FlashMessage searchParams={sp} />
      <Card className="p-5 mb-8">
        <h2 className="font-semibold mb-4">Add university</h2>
        <form action={saveUniversity} className="grid gap-4 sm:grid-cols-[2fr_1fr_1fr_2fr_auto] sm:items-end">
          <Field label="Name"><Input name="name" required minLength={2} placeholder="University of …" /></Field>
          <Field label="Country"><Input name="country" defaultValue="UK" required /></Field>
          <Field label="City"><Input name="city" /></Field>
          <Field label="Website"><Input name="website" type="url" placeholder="https://" /></Field>
          <SubmitButton>Add</SubmitButton>
        </form>
      </Card>
      {unis?.length ? (
        <Card className="divide-y divide-line">
          {unis.map((u) => (
            <Link key={u.id} href={`/admin/universities/${u.id}`} className="flex items-center gap-3 p-4 hover:bg-surface-2/60">
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
