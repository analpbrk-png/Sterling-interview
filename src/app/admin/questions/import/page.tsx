import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { Card, Field, FlashMessage, Input, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/ui/submit-button";
import { importPdf } from "../../actions";

export const metadata = { title: "Import PDF" };

export default async function ImportPdf({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  await requireAdmin();
  return (
    <>
      <PageHeader title="Import questions from a PDF" description={<Link href="/admin/questions" className="text-accent">← Question bank</Link>} />
      <FlashMessage searchParams={sp} />
      <Card className="p-5 max-w-2xl">
        <ul className="text-sm text-muted grid gap-1.5 mb-5">
          <li>• Every page is read. Questions, identity instructions, pronunciation checks and declarations are detected.</li>
          <li>• Original wording is kept unchanged with the file name and page number.</li>
          <li>• Preparation and response-time slides are attached to the questions they precede/follow.</li>
          <li>• Duplicates and similar questions are linked, never deleted. Sensitive and university-specific wording is flagged.</li>
          <li>• Everything lands as <strong>pending review</strong>: nothing is shown to students until you approve it.</li>
        </ul>
        <form action={importPdf} className="grid gap-4">
          <Field label="PDF file" hint="Text-based PDF, up to 15 MB."><Input type="file" name="file" accept="application/pdf,.pdf" required className="file:mr-3 file:rounded-lg file:border-0 file:bg-accent-soft file:px-3 file:py-1.5 file:text-accent pt-2" /></Field>
          <Field label="Country these questions apply to"><Input name="country" defaultValue="UK" /></Field>
          <SubmitButton pendingText="Reading every page…">Import for review</SubmitButton>
        </form>
      </Card>
    </>
  );
}
