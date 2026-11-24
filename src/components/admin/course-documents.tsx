"use client";
import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Badge, Button, Card, Notice } from "@/components/ui";
import { validateUpload } from "@/lib/documents/validate";
import { extractTextInBrowser } from "@/lib/documents/extract";
import { downloadPrivateFile } from "@/lib/admin/ops";
import { suggestModulesLocally } from "@/lib/local-ai/tasks";
import { useAiMode } from "./local-ai";

/** Course reference documents (private) and module suggestions for the admin to verify. */
export function CourseDocuments({ courseId, officialUrl, onAddModules }: { courseId: string; officialUrl: string | null; onAddModules: (m: string[]) => void }) {
  const s = createClient();
  const { mode } = useAiMode();
  const ref = useRef<HTMLInputElement>(null);
  const [docs, setDocs] = useState<Array<{ id: string; file_name: string; storage_path: string; mime_type: string }>>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "danger" | "warn"; text: string } | null>(null);
  const [suggested, setSuggested] = useState<string[] | null>(null);
  const load = () => void s.from("course_documents").select("id, file_name, storage_path, mime_type").eq("course_id", courseId).order("created_at").then(({ data }) => setDocs(data ?? []));
  useEffect(load, [courseId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function upload(file: File) {
    setBusy(true); setMsg(null);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const check = validateUpload("course_document", file.name, bytes);
      if (!check.ok) throw new Error(check.error);
      const path = `courses/${courseId}/${crypto.randomUUID()}.${check.ext}`;
      const { error } = await s.storage.from("student-documents").upload(path, bytes, { contentType: check.mime });
      if (error) throw new Error("Upload failed.");
      await s.from("course_documents").insert({ course_id: courseId, storage_path: path, file_name: check.safeName, mime_type: check.mime, size_bytes: bytes.length });
      load();
      setMsg({ tone: "ok", text: "Document stored privately." });
    } catch (e) { setMsg({ tone: "danger", text: e instanceof Error ? e.message : "Upload failed." }); }
    finally { setBusy(false); if (ref.current) ref.current.value = ""; }
  }

  async function suggest(d: { storage_path: string; file_name: string; mime_type: string }) {
    setBusy(true); setMsg(null); setSuggested(null);
    try {
      const text = await extractTextInBrowser(await downloadPrivateFile(d.storage_path, d.file_name, d.mime_type));
      if (text.replace(/\s/g, "").length < 40) throw new Error("No text could be read from this document.");
      const m = await suggestModulesLocally(text);
      setSuggested(m);
      setMsg({ tone: m.length ? "ok" : "warn", text: m.length ? `Found ${m.length} module name(s) in the document. Check them against the official page before marking the course verified.` : "No module names were found in this document." });
    } catch (e) { setMsg({ tone: "danger", text: e instanceof Error ? e.message : "Could not read the document." }); }
    finally { setBusy(false); }
  }

  const open = async (path: string) => {
    const { data } = await s.storage.from("student-documents").createSignedUrl(path, 60);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank", "noopener");
  };
  const remove = async (d: { id: string; storage_path: string }) => {
    if (!window.confirm("Delete this document?")) return;
    await s.storage.from("student-documents").remove([d.storage_path]);
    await s.from("course_documents").delete().eq("id", d.id);
    load();
  };

  return (
    <Card className="p-5 sm:p-6 grid gap-3">
      <h2 className="font-display text-[17px] font-semibold">Course references</h2>
      <p className="text-sm text-muted">Upload the official course handbook or module list (PDF/DOCX), and keep the official link above. Documents are private. AI questions only use modules you mark verified.</p>
      {officialUrl && <a href={officialUrl} target="_blank" rel="noreferrer" className="text-sm text-accent-fg break-all">{officialUrl}</a>}
      {docs.map((d) => (
        <div key={d.id} className="flex flex-wrap items-center gap-2 text-sm">
          <span className="flex-1 truncate">{d.file_name}</span>
          <button type="button" className="text-accent-fg" onClick={() => void open(d.storage_path)}>View</button>
          <button type="button" className="text-accent-fg disabled:opacity-50" disabled={busy || mode.label !== "Free Local AI — Active"} onClick={() => void suggest(d)}>Suggest modules (free AI)</button>
          <button type="button" className="text-danger" onClick={() => void remove(d)}>Delete</button>
        </div>
      ))}
      <input ref={ref} type="file" accept=".pdf,.docx" className="sr-only" aria-label="Upload course document" onChange={(e) => e.target.files?.[0] && void upload(e.target.files[0])} />
      <div><Button variant="secondary" disabled={busy} onClick={() => ref.current?.click()}>{busy ? "Working…" : "Upload document"}</Button></div>
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      {suggested && suggested.length > 0 && (
        <div className="grid gap-2">
          <div className="flex flex-wrap gap-1.5">{suggested.map((m) => <Badge key={m}>{m}</Badge>)}</div>
          <div><Button variant="secondary" onClick={() => { onAddModules(suggested); setSuggested(null); }}>Add to the modules list</Button></div>
        </div>
      )}
    </Card>
  );
}
