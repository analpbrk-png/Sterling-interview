"use client";
import { createClient } from "@/lib/supabase/client";
import { callFunction } from "@/lib/functions";
import { redactPersonalData, type ResumeContext } from "@/lib/ai/context";
import { basicResumeExtract } from "@/lib/ai/resume-basic";
import { validateUpload, type DocumentKind } from "./validate";

const BUCKET = "student-documents";

/**
 * Uploads a document straight to private storage. The file type is checked
 * from its bytes here; the bucket itself enforces size and allowed types, and
 * storage policies only allow the owner's folder.
 */
export async function uploadDocument(userId: string, kind: DocumentKind, file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const check = validateUpload(kind, file.name, bytes);
  if (!check.ok) throw new Error(check.error);
  const supabase = createClient();
  const path = `${userId}/${kind}-${crypto.randomUUID()}.${check.ext}`;
  const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, bytes, { contentType: check.mime, upsert: false });
  if (upErr) throw new Error("Upload failed. Please try again.");

  // One CV and one passport per student: replace the previous one.
  let previous: { id: string; storage_path: string }[] = [];
  if (kind !== "course_document") {
    const { data } = await supabase.from("student_documents").select("id, storage_path").eq("kind", kind).eq("user_id", userId);
    previous = data ?? [];
    if (previous.length) await supabase.from("student_documents").delete().in("id", previous.map((p) => p.id));
  }
  const { error: insErr } = await supabase.from("student_documents").insert({
    user_id: userId, kind, storage_path: path, file_name: check.safeName, mime_type: check.mime, size_bytes: bytes.length,
  });
  if (insErr) {
    await supabase.storage.from(BUCKET).remove([path]);
    throw new Error("Could not save the document.");
  }
  if (previous.length) await supabase.storage.from(BUCKET).remove(previous.map((p) => p.storage_path));
  return { bytes, mime: check.mime };
}

export async function deleteDocument(id: string, storagePath: string) {
  const supabase = createClient();
  await supabase.storage.from(BUCKET).remove([storagePath]);
  const { error } = await supabase.from("student_documents").delete().eq("id", id);
  if (error) throw new Error("Could not delete the document.");
}

/** Opens a file through a 60-second signed link (only the owner's link can be created). */
export async function openDocument(storagePath: string) {
  const { data, error } = await createClient().storage.from(BUCKET).createSignedUrl(storagePath, 60);
  if (error || !data) throw new Error("Could not open the document.");
  window.open(data.signedUrl, "_blank", "noopener");
}

async function extractText(bytes: Uint8Array, mime: string): Promise<string> {
  if (mime === "application/pdf") {
    const { extractText: pdfText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(bytes.slice());
    const { text } = await pdfText(pdf, { mergePages: true });
    return String(text).slice(0, 40_000);
  }
  if (mime.includes("wordprocessingml")) {
    const mammoth = await import("mammoth");
    const { value } = await mammoth.extractRawText({ arrayBuffer: bytes.slice().buffer });
    return value.slice(0, 40_000);
  }
  return "";
}

/**
 * Reads the CV in the browser, then (if AI is configured) asks the
 * extract-resume function for a better draft. Only redacted text leaves the
 * device; the raw text is discarded. Passports are never read.
 */
export async function buildResumeDraft(bytes: Uint8Array, mime: string): Promise<{ context: ResumeContext | null; mode: "ai" | "basic" | null; message: string }> {
  let text = "";
  try {
    text = await extractText(bytes, mime);
  } catch {
    return { context: null, mode: null, message: "We could not read text from this file. You can still enter your details manually." };
  }
  if (text.replace(/\s/g, "").length < 40) {
    return { context: null, mode: null, message: "This CV looks like a scanned image, so no text could be read. Please enter your details manually." };
  }
  const ai = await callFunction<{ available: boolean; context?: ResumeContext }>("extract-resume", { text: redactPersonalData(text).slice(0, 20_000) });
  if (ai.data?.available && ai.data.context) {
    return { context: ai.data.context, mode: "ai", message: "We extracted your background with AI. Please review and correct it before confirming." };
  }
  return {
    context: basicResumeExtract(text),
    mode: "basic",
    message: ai.data?.available === false
      ? "AI is not configured, so we used basic section detection. Please review it carefully."
      : "AI extraction was unavailable, so we used basic section detection. Please review it carefully.",
  };
}
