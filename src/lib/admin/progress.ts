"use client";
import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";

export type InviteStatus = "not_started" | "in_progress" | "completed" | "interrupted" | "expired";

export interface ProgressRow {
  id: string;
  student_name: string;
  student_ref: string;
  created_at: string;
  expires_at: string;
  revoked_at: string | null;
  max_attempts: number;
  attempts_used: number;
  last_opened_at: string | null;
  resume_context_status: string;
  university_id: string;
  university_name: string;
  course_id: string;
  course_name: string;
  session_id: string | null;
  session_status: string | null;
  started_at: string | null;
  completed_at: string | null;
  last_activity_at: string | null;
  total_questions: number;
  completed_questions: number;
  current_position: number | null;
  current_state: string | null;
  status: InviteStatus;
}

export const STATUS_INFO: Record<InviteStatus, { label: string; tone: "neutral" | "accent" | "ok" | "warn" | "danger" }> = {
  not_started: { label: "Not Started", tone: "neutral" },
  in_progress: { label: "In Progress", tone: "accent" },
  completed: { label: "Completed", tone: "ok" },
  interrupted: { label: "Interrupted", tone: "warn" },
  expired: { label: "Expired", tone: "danger" },
};

const STAGE: Record<string, string> = {
  pending: "Introduction",
  preparing: "Preparation time",
  answering: "Answer time",
  awaiting_submit: "Waiting for Submit",
};

/** Human-readable current stage, derived only from recorded data. */
export function stageLabel(r: ProgressRow): string {
  if (r.status === "completed") return "Completed";
  if (!r.session_id) return r.revoked_at ? "Link revoked" : r.last_opened_at ? "Opened link (not started)" : "Link not opened";
  if (r.session_status === "abandoned") return "Ended early";
  if (r.current_position == null) return "Finishing";
  if (r.current_state === "pending" && r.current_position === 0) return "Introduction (camera, passport, name)";
  return `Question ${r.current_position + 1} — ${STAGE[r.current_state ?? "pending"] ?? r.current_state}`;
}

export const percent = (r: ProgressRow) => (r.total_questions ? Math.round((r.completed_questions / r.total_questions) * 100) : 0);

/**
 * Calls onChange (debounced) whenever invitations, sessions or session
 * questions change. Realtime respects RLS, so only admins receive events.
 */
export function useLiveChanges(onChange: () => void, filter?: { sessionId?: string | null }) {
  const cb = useRef(onChange);
  cb.current = onChange;
  useEffect(() => {
    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const fire = () => { clearTimeout(timer); timer = setTimeout(() => cb.current(), 400); };
    const channel = supabase.channel(`admin-progress-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "interview_invitations" }, fire)
      .on("postgres_changes", { event: "*", schema: "public", table: "interview_sessions" }, fire)
      .on("postgres_changes", { event: "*", schema: "public", table: "interview_session_questions", ...(filter?.sessionId ? { filter: `session_id=eq.${filter.sessionId}` } : {}) }, fire)
      .subscribe();
    // Status such as "Interrupted" also depends on time passing; refresh periodically.
    const interval = setInterval(() => cb.current(), 30_000);
    return () => { clearTimeout(timer); clearInterval(interval); void supabase.removeChannel(channel); };
  }, [filter?.sessionId]);
}
