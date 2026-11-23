"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { useAction } from "@/lib/use-action";
import { setFlash } from "@/lib/flash";
import { importPdf } from "@/lib/admin/ops";
import { Button, Card, Field, FlashBar, Input, PageHeader } from "@/components/ui";

export default function ImportPdf() {
  const { user } = useAuth();
  const router = useRouter();
  const { run, busy, flash } = useAction();
  return (
    <>
      <PageHeader title="Import questions from a PDF" description={<Link href="/admin/questions/" className="text-accent">← Question bank</Link>} />
      <FlashBar flash={flash} />
      <Card className="p-5 max-w-2xl">
        <ul className="text-sm text-muted grid gap-1.5 mb-5">
          <li>• The PDF is read in your browser. Every page is checked for questions, identity instructions, pronunciation checks and declarations.</li>
          <li>• Original wording is kept unchanged with the file name and page number.</li>
          <li>• Preparation and response-time slides are attached to the questions they precede/follow.</li>
          <li>• Duplicates and similar questions are linked, never deleted. Sensitive and university-specific wording is flagged.</li>
          <li>• Everything lands as <strong>pending review</strong>: nothing is shown to students until you approve it.</li>
        </ul>
        <form onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const file = f.get("file");
          void run(async () => {
            if (!(file instanceof File)) throw new Error("Choose a PDF file.");
            const msg = await importPdf(file, String(f.get("country") || "UK"), user!.id);
            setFlash({ tone: "ok", text: msg });
            router.push("/admin/questions/?status=pending_review");
          });
        }} className="grid gap-4">
          <Field label="PDF file" hint="Text-based PDF, up to 15 MB."><Input type="file" name="file" accept="application/pdf,.pdf" required className="file:mr-3 file:rounded-lg file:border-0 file:bg-accent-soft file:px-3 file:py-1.5 file:text-accent pt-2" /></Field>
          <Field label="Country these questions apply to"><Input name="country" defaultValue="UK" /></Field>
          <Button type="submit" disabled={busy}>{busy ? "Reading every page…" : "Import for review"}</Button>
        </form>
      </Card>
    </>
  );
}
