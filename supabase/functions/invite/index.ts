/**
 * Student interview API. Students have no account: every call carries the
 * secret link token, which is hashed and matched here before anything else.
 * A token only ever reaches its own invitation and its own sessions.
 */
import { adminClient, handle, json } from "../_shared/http.ts";
import { getAIProvider } from "../_shared/anthropic.ts";
import { redactPersonalData, sanitiseResumeContext } from "../_shared/context.ts";
import { basicResumeExtract } from "../_shared/resume-basic.ts";
import { validateUpload } from "../_shared/upload-validate.ts";
import { buildSessionForInvitation, BuildError, type InvitationRow } from "../_shared/build-session.ts";
import type { SupabaseClient } from "../_shared/deps.ts";

const TOKEN_RE = /^[A-Za-z0-9_-]{40,64}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATES = ["preparing", "answering", "awaiting_submit", "completed", "timed_out"];

async function sha256Hex(s: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

type Inv = InvitationRow & {
  student_name: string; student_ref: string; expires_at: string; revoked_at: string | null;
  max_attempts: number; attempts_used: number; resume_extraction_mode: string | null;
};

/** Validates the token. Generic errors avoid revealing whether a token ever existed. */
async function resolve(db: SupabaseClient, token: unknown): Promise<{ inv: Inv } | { error: string; code: string; status: number }> {
  if (typeof token !== "string" || !TOKEN_RE.test(token)) return { error: "This interview link is not valid.", code: "invalid", status: 404 };
  const { data: inv } = await db.from("interview_invitations").select("*").eq("token_hash", await sha256Hex(token)).maybeSingle();
  if (!inv) return { error: "This interview link is not valid.", code: "invalid", status: 404 };
  if (inv.revoked_at) return { error: "This interview link has been withdrawn. Please contact your adviser.", code: "revoked", status: 410 };
  if (new Date(inv.expires_at).getTime() < Date.now()) return { error: "This interview link has expired. Please contact your adviser.", code: "expired", status: 410 };
  return { inv: inv as Inv };
}

async function activeSession(db: SupabaseClient, invitationId: string) {
  const { data } = await db.from("interview_sessions").select("id")
    .eq("invitation_id", invitationId).in("status", ["ready", "in_progress"]).order("created_at", { ascending: false }).limit(1).maybeSingle();
  return data?.id as string | undefined;
}

async function sessionPayload(db: SupabaseClient, sessionId: string) {
  const { data: s } = await db.from("interview_sessions").select("id, status, university_name, course_name, generation_notice, config, question_count").eq("id", sessionId).single();
  const { data: qs } = await db.from("interview_session_questions")
    .select("position, question_text, prep_seconds, answer_seconds, submission_mode, state, presented_at, answer_started_at")
    .eq("session_id", sessionId).order("position");
  return { ...s, questions: qs ?? [] };
}

function invitationSummary(inv: Inv) {
  return {
    studentName: inv.student_name,
    studentId: inv.student_ref,
    previousQualification: inv.previous_qualification,
    resumeContext: sanitiseResumeContext(inv.resume_context),
    resumeStatus: inv.resume_context_status,
    resumeExtractionMode: inv.resume_extraction_mode,
    attemptsLeft: Math.max(0, inv.max_attempts - inv.attempts_used),
  };
}

async function handleUpload(req: Request, db: SupabaseClient) {
  const form = await req.formData().catch(() => null);
  if (!form) return json(req, { error: "Invalid upload." }, 400);
  const r = await resolve(db, form.get("token"));
  if ("error" in r) return json(req, { error: r.error, code: r.code }, r.status);
  const file = form.get("file");
  if (!(file instanceof File)) return json(req, { error: "Choose a file." }, 400);
  const bytes = new Uint8Array(await file.arrayBuffer());
  // File type is checked here, on the server, from the file's bytes.
  const check = validateUpload("resume", file.name, bytes);
  if (!check.ok) return json(req, { error: check.error }, 400);

  const path = `invitations/${r.inv.id}/resume-${crypto.randomUUID()}.${check.ext}`;
  const { error: upErr } = await db.storage.from("student-documents").upload(path, bytes, { contentType: check.mime, upsert: false });
  if (upErr) return json(req, { error: "Upload failed. Please try again." }, 500);
  const { data: old } = await db.from("invitation_documents").select("id, storage_path").eq("invitation_id", r.inv.id).eq("kind", "resume");
  if (old?.length) {
    await db.from("invitation_documents").delete().in("id", old.map((o) => o.id));
    await db.storage.from("student-documents").remove(old.map((o) => o.storage_path));
  }
  await db.from("invitation_documents").insert({
    invitation_id: r.inv.id, kind: "resume", storage_path: path, file_name: check.safeName, mime_type: check.mime, size_bytes: bytes.length, uploaded_by: "student",
  });

  // The browser extracted and redacted the text; redact again before any AI call.
  const text = String(form.get("text") ?? "").slice(0, 40_000);
  let context = null;
  let mode: "ai" | "basic" | null = null;
  let message = "This CV looks like a scanned image, so no text could be read. You can type your background below.";
  if (text.replace(/\s/g, "").length >= 40) {
    const provider = getAIProvider();
    if (provider) {
      try {
        context = await provider.extractResume(redactPersonalData(text).slice(0, 20_000));
        mode = "ai";
        message = "We read your CV with AI. Please check the details below.";
      } catch (err) {
        console.error("[ai] resume extraction failed", err instanceof Error ? err.message : err);
      }
    }
    if (!context) {
      context = basicResumeExtract(redactPersonalData(text));
      mode = "basic";
      message = "We read the main sections of your CV. Please check the details below.";
    }
    await db.from("interview_invitations").update({ resume_context: context, resume_context_status: "draft", resume_extraction_mode: mode }).eq("id", r.inv.id);
  }
  return json(req, { ok: true, context: context ? sanitiseResumeContext(context) : null, mode, message });
}

Deno.serve(async (req) => {
  if (req.method === "POST" && (req.headers.get("content-type") ?? "").startsWith("multipart/form-data")) {
    try {
      return await handleUpload(req, adminClient());
    } catch (err) {
      console.error(err instanceof Error ? err.message : err);
      return json(req, { error: "Upload failed. Please try again." }, 500);
    }
  }
  return handle(async (req) => {
    const db = adminClient();
    const body = await req.json().catch(() => ({}));
    const r = await resolve(db, body.token);
    if ("error" in r) return json(req, { error: r.error, code: r.code }, r.status);
    const inv = r.inv;
    const sessionId = typeof body.sessionId === "string" && UUID_RE.test(body.sessionId) ? body.sessionId : null;

    switch (body.action) {
      case "open": {
        await db.from("interview_invitations").update({ last_opened_at: new Date().toISOString() }).eq("id", inv.id);
        const active = await activeSession(db, inv.id);
        if (active) await db.from("interview_sessions").update({ last_activity_at: new Date().toISOString() }).eq("id", active);
        const { data: university } = await db.from("universities").select("name").eq("id", inv.university_id).single();
        const { data: course } = await db.from("courses").select("name").eq("id", inv.course_id).single();
        const { data: last } = await db.from("interview_sessions").select("status, completed_at, duration_seconds, question_count")
          .eq("invitation_id", inv.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
        return json(req, {
          invitation: { ...invitationSummary(inv), universityName: university?.name, courseName: course?.name },
          session: active ? await sessionPayload(db, active) : null,
          lastSession: last ?? null,
          serverNow: Date.now(),
        });
      }
      case "save_profile": {
        const context = sanitiseResumeContext(body.context);
        const pq = typeof body.previousQualification === "string" ? body.previousQualification.trim().slice(0, 200) || null : inv.previous_qualification;
        await db.from("interview_invitations").update({ resume_context: context, resume_context_status: "confirmed", previous_qualification: pq }).eq("id", inv.id);
        return json(req, { ok: true });
      }
      case "start": {
        const existing = await activeSession(db, inv.id);
        if (existing) return json(req, { session: await sessionPayload(db, existing), serverNow: Date.now() });
        // Consume one attempt atomically (guards against double clicks and parallel tabs).
        const { data: claimed } = await db.from("interview_invitations")
          .update({ attempts_used: inv.attempts_used + 1 })
          .eq("id", inv.id).eq("attempts_used", inv.attempts_used).lt("attempts_used", inv.max_attempts)
          .select("id").maybeSingle();
        if (!claimed) {
          const again = await activeSession(db, inv.id);
          if (again) return json(req, { session: await sessionPayload(db, again), serverNow: Date.now() });
          return json(req, { error: "You have used all attempts for this interview. Please contact your adviser if you need another try.", code: "no_attempts" }, 409);
        }
        try {
          const id = await buildSessionForInvitation(db, inv);
          return json(req, { session: await sessionPayload(db, id), serverNow: Date.now() });
        } catch (err) {
          // Give the attempt back if nothing was created.
          await db.from("interview_invitations").update({ attempts_used: inv.attempts_used }).eq("id", inv.id);
          if (err instanceof BuildError) return json(req, { error: err.message, code: err.code }, 400);
          throw err;
        }
      }
      case "progress": {
        if (!sessionId || !STATES.includes(body.state) || !Number.isInteger(body.position)) return json(req, { error: "Bad request" }, 400);
        const method = ["manual", "automatic", "early"].includes(body.method) ? body.method : null;
        const { data, error } = await db.rpc("invite_record_progress", { p_invitation: inv.id, p_session: sessionId, p_position: body.position, p_state: body.state, p_method: method });
        if (error) throw error;
        return json(req, data);
      }
      case "complete": {
        if (!sessionId) return json(req, { error: "Bad request" }, 400);
        const { data, error } = await db.rpc("invite_complete_session", { p_invitation: inv.id, p_session: sessionId });
        if (error) throw error;
        return json(req, { ...data, attemptsLeft: Math.max(0, inv.max_attempts - inv.attempts_used) });
      }
      case "abandon": {
        if (!sessionId) return json(req, { error: "Bad request" }, 400);
        await db.rpc("invite_abandon_session", { p_invitation: inv.id, p_session: sessionId });
        return json(req, { ok: true });
      }
      default:
        return json(req, { error: "Unknown action" }, 400);
    }
  })(req);
});
