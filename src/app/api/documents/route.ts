import { NextResponse, type NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { validateUpload, type DocumentKind } from "@/lib/documents/validate";
import { buildResumeDraft } from "@/lib/documents/resume-context";

export const runtime = "nodejs";
const KINDS: DocumentKind[] = ["resume", "passport", "course_document"];

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });

  const form = await request.formData().catch(() => null);
  const kind = form?.get("kind") as DocumentKind | null;
  const file = form?.get("file");
  const applicationId = (form?.get("application_id") as string | null) || null;
  if (!kind || !KINDS.includes(kind) || !(file instanceof File)) {
    return NextResponse.json({ error: "Invalid upload." }, { status: 400 });
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const check = validateUpload(kind, file.name, bytes);
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 });

  // User-scoped client: RLS and storage policies apply.
  const supabase = await createClient();
  const path = `${user.id}/${kind}-${randomUUID()}.${check.ext}`;
  const { error: upErr } = await supabase.storage
    .from("student-documents")
    .upload(path, bytes, { contentType: check.mime, upsert: false });
  if (upErr) return NextResponse.json({ error: "Upload failed. Please try again." }, { status: 500 });

  // Replace: one CV and one passport per student.
  let previous: { id: string; storage_path: string }[] = [];
  if (kind !== "course_document") {
    const { data } = await supabase.from("student_documents").select("id, storage_path").eq("kind", kind).eq("user_id", user.id);
    previous = data ?? [];
    if (previous.length) await supabase.from("student_documents").delete().in("id", previous.map((p) => p.id));
  }
  const { data: doc, error: insErr } = await supabase
    .from("student_documents")
    .insert({ user_id: user.id, kind, application_id: applicationId, storage_path: path, file_name: check.safeName, mime_type: check.mime, size_bytes: bytes.length })
    .select("id")
    .single();
  if (insErr || !doc) {
    await supabase.storage.from("student-documents").remove([path]);
    return NextResponse.json({ error: "Could not save the document." }, { status: 500 });
  }
  if (previous.length) await supabase.storage.from("student-documents").remove(previous.map((p) => p.storage_path));

  // Passports are stored only; they are never read or sent anywhere.
  let extraction: { mode: string | null; message: string } | null = null;
  if (kind === "resume") {
    const draft = await buildResumeDraft(bytes, check.mime);
    extraction = { mode: draft.mode, message: draft.message };
    if (draft.context) {
      await supabase
        .from("student_profiles")
        .update({ resume_context: draft.context, resume_context_status: "draft", resume_extraction_mode: draft.mode })
        .eq("user_id", user.id);
    }
  }
  return NextResponse.json({ ok: true, id: doc.id, extraction });
}
