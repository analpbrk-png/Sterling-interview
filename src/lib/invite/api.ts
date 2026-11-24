"use client";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { redactPersonalData, type ResumeContext } from "@/lib/ai/context";
import { extractTextInBrowser } from "@/lib/documents/extract";
import type { ProgressItem } from "@/lib/interview/progress-queue";
import type { AudioUploadApi } from "@/lib/interview/audio-uploads";

/** The link token lives in the URL fragment (#...), which browsers never send to any server. */
export function readTokenFromLocation(): string | null {
  const t = window.location.hash.replace(/^#/, "").trim();
  return /^[A-Za-z0-9_-]{40,64}$/.test(t) ? t : null;
}

export class InviteError extends Error {
  constructor(message: string, public code: string, public retryable: boolean) {
    super(message);
  }
}

async function call<T>(body: Record<string, unknown> | FormData): Promise<T> {
  let res;
  try {
    res = await createClient().functions.invoke("invite", { body });
  } catch {
    throw new InviteError("Could not reach the server. Check your connection and try again.", "network", true);
  }
  const { data, error } = res;
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const payload = await error.context.json().catch(() => ({}));
      const status = error.context.status as number;
      throw new InviteError(payload.error ?? "Request failed.", payload.code ?? String(status), status >= 500);
    }
    throw new InviteError("Could not reach the server. Check your connection and try again.", "network", true);
  }
  return data as T;
}

export interface ServerQuestion {
  position: number;
  question_text: string;
  prep_seconds: number;
  answer_seconds: number;
  submission_mode: "manual" | "automatic";
  state: string;
  presented_at: string | null;
  answer_started_at: string | null;
}

export interface ServerSession {
  id: string;
  status: string;
  university_name: string;
  course_name: string;
  generation_notice: string | null;
  config: unknown;
  question_count: number;
  questions: ServerQuestion[];
}

export interface OpenResult {
  invitation: {
    studentName: string;
    studentId: string;
    universityName: string;
    courseName: string;
    previousQualification: string | null;
    resumeContext: ResumeContext;
    resumeStatus: "none" | "draft" | "confirmed";
    resumeExtractionMode: string | null;
    attemptsLeft: number;
    /** null until the student has chosen. */
    audioConsent: boolean | null;
  };
  session: ServerSession | null;
  lastSession: { status: string; completed_at: string | null; duration_seconds: number | null; question_count: number } | null;
  serverNow: number;
}

/** Marks errors that a retry cannot fix (rejected by the server), so uploads stop retrying. */
function permanent(e: unknown) {
  if (e instanceof InviteError && !e.retryable && e.code !== "not_ready") (e as InviteError & { permanent?: boolean }).permanent = true;
  return e;
}

export function audioUploadApi(token: string, sessionId: string): AudioUploadApi {
  return {
    begin: (meta) => call<{ recordingId: string; alreadyUploaded?: boolean; path?: string; uploadToken?: string; bucket?: string }>({ action: "audio_begin", token, sessionId, ...meta }).catch((e) => { throw permanent(e); }),
    async put(bucket, path, uploadToken, blob, contentType) {
      const { error } = await createClient().storage.from(bucket).uploadToSignedUrl(path, uploadToken, blob, { contentType, upsert: true });
      if (error) throw new InviteError(`Audio upload failed: ${error.message}`, "upload", true);
    },
    finish: (position, recordingId) => call<{ ok: boolean }>({ action: "audio_finish", token, sessionId, position, recordingId }).then(() => undefined).catch((e) => { throw permanent(e); }),
  };
}

export function inviteApi(token: string) {
  return {
    open: () => call<OpenResult>({ action: "open", token }),
    start: () => call<{ session: ServerSession; serverNow: number }>({ action: "start", token }),
    saveProfile: (context: ResumeContext, previousQualification: string | null) =>
      call<{ ok: boolean }>({ action: "save_profile", token, context, previousQualification }),
    async uploadResume(file: File) {
      // Only redacted text leaves the device for reading; the file itself goes to private storage.
      const text = redactPersonalData(await extractTextInBrowser(file));
      const form = new FormData();
      form.set("token", token);
      form.set("file", file);
      form.set("text", text);
      return call<{ ok: boolean; context: ResumeContext | null; mode: string | null; message: string }>(form);
    },
    async progress(sessionId: string, item: ProgressItem) {
      // Throws (and is retried) only on network/server errors; rejected transitions resolve.
      const res = await call<{ ok: boolean; reason?: string }>({ action: "progress", token, sessionId, position: item.position, state: item.state, method: item.method });
      if (!res.ok) console.warn("[interview] transition not accepted:", res.reason);
    },
    complete: (sessionId: string) => call<{ ok: boolean; duration_seconds?: number; attemptsLeft: number; reason?: string }>({ action: "complete", token, sessionId }),
    consent: (granted: boolean) => call<{ ok: boolean; granted: boolean }>({ action: "consent", token, granted }),
    abandon: (sessionId: string) => call<{ ok: boolean }>({ action: "abandon", token, sessionId }),
  };
}
