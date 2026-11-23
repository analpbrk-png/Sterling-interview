"use server";

import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { createInterviewSession, SessionCreationError } from "@/lib/interview/create-session";

export type StartResult = { ok: true; sessionId: string } | { ok: false; code: string; message: string };

export async function startInterview(applicationId: string): Promise<StartResult> {
  const user = await requireUser();
  const id = z.string().uuid().safeParse(applicationId);
  if (!id.success) return { ok: false, code: "application_not_found", message: "That application was not found." };
  try {
    const { sessionId } = await createInterviewSession(user.id, id.data);
    return { ok: true, sessionId };
  } catch (err) {
    if (err instanceof SessionCreationError) return { ok: false, code: err.code, message: err.message };
    console.error("[session] create failed", err);
    return { ok: false, code: "unknown", message: "Something went wrong while preparing your interview. Please try again." };
  }
}
