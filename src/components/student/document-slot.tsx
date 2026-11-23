"use client";
import { useRef, useState } from "react";
import { Badge, Notice, cx } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";
import { buildResumeDraft, deleteDocument, openDocument, uploadDocument } from "@/lib/documents/client";

export interface DocSummary {
  id: string;
  file_name: string;
  size_bytes: number;
  created_at: string;
  storage_path: string;
}

export function DocumentSlot({ userId, kind, title, description, accept, existing, multiple = false, onChange }: {
  userId: string;
  kind: "resume" | "passport" | "course_document";
  title: string;
  description: string;
  accept: string;
  existing: DocSummary[];
  multiple?: boolean;
  onChange: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "danger" | "warn"; text: string } | null>(null);

  async function upload(file: File) {
    if (busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const { bytes, mime } = await uploadDocument(userId, kind, file);
      if (kind === "resume") {
        const draft = await buildResumeDraft(bytes, mime);
        if (draft.context) {
          await createClient().from("student_profiles")
            .update({ resume_context: draft.context, resume_context_status: "draft", resume_extraction_mode: draft.mode })
            .eq("user_id", userId);
        }
        setMsg({ tone: draft.mode === "ai" ? "ok" : "warn", text: draft.message });
      } else {
        setMsg({ tone: "ok", text: "Uploaded." });
      }
      onChange();
    } catch (e) {
      setMsg({ tone: "danger", text: e instanceof Error ? e.message : "Upload failed. Check your connection and try again." });
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  async function remove(d: DocSummary) {
    if (!window.confirm("Delete this document permanently?")) return;
    setBusy(true);
    try {
      await deleteDocument(d.id, d.storage_path);
      setMsg({ tone: "ok", text: "Deleted." });
      onChange();
    } catch (e) {
      setMsg({ tone: "danger", text: e instanceof Error ? e.message : "Could not delete." });
    } finally {
      setBusy(false);
    }
  }

  const canAdd = multiple || existing.length === 0;
  return (
    <div className="space-y-3">
      <div>
        <p className="font-medium text-ink">{title}</p>
        <p className="text-sm text-muted">{description}</p>
      </div>
      {existing.map((d) => (
        <div key={d.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface-2/60 px-3.5 py-2.5">
          <span className="min-w-0 flex-1 truncate text-sm text-ink">{d.file_name}</span>
          <Badge>{Math.max(1, Math.round(d.size_bytes / 1024))} KB</Badge>
          <button type="button" className="text-sm text-accent font-medium" onClick={() => openDocument(d.storage_path).catch((e) => setMsg({ tone: "danger", text: e.message }))}>View</button>
          {!multiple && <button type="button" className="text-sm text-ink-2 hover:text-ink" onClick={() => input.current?.click()} disabled={busy}>Replace</button>}
          <button type="button" className="text-sm text-danger" onClick={() => remove(d)} disabled={busy}>Delete</button>
        </div>
      ))}
      <input ref={input} type="file" accept={accept} className="sr-only" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} aria-label={`Upload ${title}`} />
      {canAdd && (
        <div
          role="button"
          tabIndex={0}
          onClick={() => input.current?.click()}
          onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && input.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files?.[0]; if (f) upload(f); }}
          className={cx(
            "flex flex-col items-center justify-center gap-1 rounded-xl border border-dashed px-4 py-6 text-center cursor-pointer transition",
            drag ? "border-accent bg-accent-soft" : "border-line hover:border-accent/60 hover:bg-surface-2/60",
          )}
        >
          <span className="text-sm font-medium text-ink">{busy ? "Uploading…" : "Choose a file or drop it here"}</span>
          <span className="text-xs text-muted">{accept.replaceAll(".", "").toUpperCase().replaceAll(",", ", ")}</span>
        </div>
      )}
      {busy && !canAdd && <p className="text-sm text-muted">Working…</p>}
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
    </div>
  );
}
