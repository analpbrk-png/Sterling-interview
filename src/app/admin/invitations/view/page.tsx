"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { maybe, must, useLoad, useParam } from "@/lib/use-load";
import { useAction } from "@/lib/use-action";
import { setFlash } from "@/lib/flash";
import { attachResume, deleteInvitation } from "@/lib/admin/ops";
import { percent, stageLabel, STATUS_INFO, useLiveChanges, type ProgressRow } from "@/lib/admin/progress";
import { LinkActions } from "@/components/admin/link-actions";
import { PersonalisePanel } from "@/components/admin/personalise-panel";
import { useAuth } from "@/components/auth-provider";
import { Badge, Button, Card, FlashBar, LinkButton, LoadError, Loading, PageHeader, ProgressBar } from "@/components/ui";
import { BarChart3 } from "lucide-react";
import { formatDate, formatDuration, STATUS_LABEL } from "@/lib/format";

const Q_STATE: Record<string, { label: string; tone: "neutral" | "accent" | "ok" | "warn" }> = {
  pending: { label: "Not reached", tone: "neutral" },
  preparing: { label: "Preparing", tone: "accent" },
  answering: { label: "Answering", tone: "accent" },
  awaiting_submit: { label: "Waiting for Submit", tone: "warn" },
  completed: { label: "Completed", tone: "ok" },
  timed_out: { label: "Completed (time up)", tone: "ok" },
};

export default function InvitationRecord() {
  const id = useParam("id");
  const router = useRouter();
  const { user } = useAuth();
  const { run, busy, flash } = useAction();
  const fileRef = useRef<HTMLInputElement>(null);
  const { data, error, loading, reload } = useLoad(async () => {
    if (!id) return null;
    const s = createClient();
    const row = maybe(await s.from("admin_invitation_progress").select("*").eq("id", id).maybeSingle()) as ProgressRow | null;
    if (!row) return null;
    const [inv, sessions, docs] = await Promise.all([
      s.from("interview_invitations").select("previous_qualification, resume_context_status, resume_extraction_mode, template_id, question_count, prep_seconds, answer_seconds, submission_mode").eq("id", id).single(),
      s.from("interview_sessions").select("id, status, created_at, started_at, completed_at, duration_seconds, question_count, generation_mode, generation_notice").eq("invitation_id", id).order("created_at", { ascending: false }),
      s.from("invitation_documents").select("id, file_name, storage_path, mime_type, uploaded_by, created_at").eq("invitation_id", id),
    ]);
    const list = must(sessions);
    const latest = list[0];
    const questions = latest ? must(await s.from("interview_session_questions").select("id, position, question_text, origin, category_id, prep_seconds, answer_seconds, submission_mode, state, presented_at, answer_started_at, completed_at, completion_method").eq("session_id", latest.id).order("position")) : [];
    const recs = latest ? must(await s.from("interview_answer_recordings").select("session_question_id, upload_status, recorded_duration_ms, speech_duration_ms, speech_is_estimate").eq("session_id", latest.id)) : [];
    return { row, inv: must(inv), sessions: list, docs: must(docs), questions, recs };
  }, [id]);
  useLiveChanges(() => void reload());

  if (id === undefined || (loading && !data)) return <Loading />;
  if (error || !data) return <LoadError error={error ?? "Interview not found."} />;
  const { row, sessions, docs, questions, recs } = data;
  const recByQ = new Map(recs.map((r) => [r.session_question_id, r]));
  const info = STATUS_INFO[row.status];

  const openDoc = (path: string) => void run(async () => {
    const { data: signed, error } = await createClient().storage.from("student-documents").createSignedUrl(path, 60);
    if (error || !signed) throw new Error("Could not open the file.");
    window.open(signed.signedUrl, "_blank", "noopener");
  });

  return (
    <>
      <PageHeader eyebrow="Student interview" title={row.student_name} description={<><Link href="/admin/interviews/" className="inline-flex items-center gap-1 text-sm font-medium text-accent-fg hover:underline">← Interviews</Link> · Student ID {row.student_ref}</>}
        actions={<LinkActions row={row} run={run} busy={busy} />} />
      <FlashBar flash={flash} />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="grid gap-6 content-start min-w-0">
          <Card className="p-5 sm:p-6">
            <div className="flex flex-wrap items-center gap-3">
              <Badge dot tone={info.tone}>{info.label}</Badge>
              <span className="text-sm text-ink-2">{stageLabel(row)}</span>
              <span className="ml-auto text-xs text-muted">Updates live</span>
            </div>
            <p className="mt-4 font-display text-4xl font-semibold tabular-nums">{row.completed_questions} <span className="text-lg text-muted font-normal">of {row.total_questions || "—"} questions</span></p>
            <ProgressBar className="mt-3 h-2" value={percent(row)} tone={row.status === "completed" ? "ok" : "accent"} label="Interview progress" />
            <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-muted">{percent(row)}% complete</p>
              <LinkButton size="sm" href={`/admin/invitations/analysis/?id=${row.id}`}><BarChart3 /> Interview analysis</LinkButton>
            </div>
          </Card>

          <PersonalisePanel
            invitationId={row.id}
            adminId={user!.id}
            cv={docs[0] ? { storage_path: docs[0].storage_path, file_name: docs[0].file_name, mime_type: docs[0].mime_type } : null}
            started={!!row.session_id}
            onSaved={() => void reload()}
          />

          <Card className="divide-y divide-line" id="questions">
            <div className="p-4"><h2 className="font-display text-[17px] font-semibold">Question progression</h2><p className="text-sm text-muted">Latest attempt. Answers are not recorded; only timing and completion are shown.</p></div>
            {questions.length ? questions.map((q) => (
              <div key={q.position} className={`p-4 sm:px-5 flex gap-3 ${q.position === row.current_position ? "bg-accent-soft" : ""}`}>
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-surface-2 text-xs font-semibold text-ink-2 tabular-nums">{q.position + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-ink">{q.question_text}</p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5 items-center">
                    <Badge tone={Q_STATE[q.state]?.tone ?? "neutral"}>{Q_STATE[q.state]?.label ?? q.state}</Badge>
                    <Badge>{q.origin === "ai_generated" ? "AI personalised" : q.origin}</Badge>
                    <Badge>Allowed: {q.prep_seconds}s prep / {q.answer_seconds}s answer · {q.submission_mode}</Badge>
                    {(() => {
                      const r = recByQ.get(q.id);
                      if (!r) return q.state === "completed" || q.state === "timed_out" ? <Badge>Not recorded</Badge> : null;
                      if (r.upload_status !== "uploaded") return <Badge tone="warn">Recording {r.upload_status}</Badge>;
                      return <Badge tone="gold">Spoke {r.speech_duration_ms != null ? `${(r.speech_duration_ms / 1000).toFixed(1)}s${r.speech_is_estimate ? " (est.)" : ""}` : "—"} of {((r.recorded_duration_ms ?? 0) / 1000).toFixed(1)}s recorded</Badge>;
                    })()}
                    {q.completion_method && <Badge>{q.completion_method === "early" ? "finished early" : q.completion_method}</Badge>}
                    {q.completed_at && <span className="text-xs text-muted">{formatDate(q.completed_at)}</span>}
                  </div>
                </div>
              </div>
            )) : <p className="p-4 text-sm text-muted">The student has not started yet. Questions are prepared when they begin.</p>}
          </Card>
        </div>

        <div className="grid gap-6 content-start min-w-0">
          <Card className="p-5 sm:p-6 text-sm grid gap-2.5">
            <h2 className="font-display text-[17px] font-semibold mb-1">Details</h2>
            {([
              ["University", row.university_name],
              ["Course", row.course_name],
              ["Invitation created", formatDate(row.created_at)],
              ["Link expires", formatDate(row.expires_at)],
              ["Link opened", formatDate(row.last_opened_at)],
              ["Interview started", formatDate(row.started_at)],
              ["Completed", formatDate(row.completed_at)],
              ["Attempts", `${row.attempts_used} of ${row.max_attempts} used`],
              ["Link", row.revoked_at ? `Revoked ${formatDate(row.revoked_at)}` : "Active"],
            ] as const).map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3 border-b border-line last:border-0 pb-2.5 last:pb-0"><span className="text-muted shrink-0">{k}</span><span className="text-right font-medium min-w-0 break-words">{v}</span></div>
            ))}
          </Card>

          <Card className="p-5 sm:p-6 grid gap-3">
            <h2 className="font-display text-[17px] font-semibold">CV</h2>
            {docs.length ? docs.map((d) => (
              <div key={d.id} className="flex items-center gap-2 text-sm min-w-0 rounded-xl border border-line p-2.5">
                <span className="truncate flex-1 min-w-0">{d.file_name}</span>
                <Badge>{d.uploaded_by}</Badge>
                <button type="button" className="text-accent-fg font-medium" onClick={() => openDoc(d.storage_path)}>View</button>
              </div>
            )) : <p className="text-sm text-muted">No CV yet.</p>}
            <p className="text-xs text-muted">Background: {data.inv.resume_context_status === "confirmed" ? "confirmed by student" : data.inv.resume_context_status === "draft" ? "extracted, not yet reviewed" : "none"}</p>
            <input ref={fileRef} type="file" accept=".pdf,.docx" className="sr-only" aria-label="Attach CV"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void run(async () => { const m = await attachResume(row.id, f); await reload(); return m; }); }} />
            <Button variant="secondary" disabled={busy} onClick={() => fileRef.current?.click()}>{docs.length ? "Replace CV" : "Attach CV"}</Button>
          </Card>

          {sessions.length > 0 && (
            <Card className="p-5 sm:p-6 grid gap-2 text-sm">
              <h2 className="font-display text-[17px] font-semibold">Attempts</h2>
              {sessions.map((s, i) => (
                <div key={s.id} className="flex justify-between gap-2">
                  <span>#{sessions.length - i} · {formatDate(s.created_at)}</span>
                  <span className="text-muted">{STATUS_LABEL[s.status]}{s.duration_seconds != null ? ` · ${formatDuration(s.duration_seconds)}` : ""}</span>
                </div>
              ))}
              {sessions[0]?.generation_notice && <p className="text-xs text-warn">{sessions[0].generation_notice}</p>}
            </Card>
          )}

          <Button variant="danger" disabled={busy} onClick={() => window.confirm(`Delete ${row.student_name}'s interview, CV and progress permanently?`) && void run(async () => {
            await deleteInvitation(row.id);
            setFlash({ tone: "ok", text: "Interview deleted." });
            router.push("/admin/");
          })}>Delete interview</Button>
        </div>
      </div>
    </>
  );
}
