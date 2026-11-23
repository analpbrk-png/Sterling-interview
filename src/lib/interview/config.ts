import type { IntroStep } from "./machine";

/** Snapshot of template settings stored on each session (interview_sessions.config). */
export interface SessionConfig {
  templateName: string;
  introSteps: IntroStep[];
  pronunciationWords: string[];
  declarationText: string | null;
  allowEarlySubmit: boolean;
  ttsDefault: boolean;
  ttsRate: number;
  includesSensitive: boolean;
}

export interface TemplateRow {
  id: string;
  name: string;
  identity_enabled: boolean;
  name_id_step_enabled: boolean;
  pronunciation_enabled: boolean;
  pronunciation_words: string[];
  declaration_enabled: boolean;
  declaration_text: string | null;
  prep_seconds: number;
  answer_seconds: number;
  submission_mode: "manual" | "automatic";
  allow_early_submit: boolean;
  question_count: number;
  ai_question_count: number;
  include_sensitive: boolean;
  tts_default: boolean;
}

export function buildSessionConfig(t: TemplateRow, ttsRate: number): SessionConfig {
  const steps: IntroStep[] = ["welcome", "media"];
  if (t.identity_enabled) steps.push("passport");
  if (t.name_id_step_enabled) steps.push("name_id");
  if (t.pronunciation_enabled && t.pronunciation_words.length) steps.push("pronunciation");
  if (t.declaration_enabled && t.declaration_text) steps.push("declaration");
  return {
    templateName: t.name,
    introSteps: steps,
    pronunciationWords: t.pronunciation_enabled ? t.pronunciation_words.slice(0, 6) : [],
    declarationText: t.declaration_enabled ? t.declaration_text : null,
    allowEarlySubmit: t.allow_early_submit,
    ttsDefault: t.tts_default,
    ttsRate: Math.min(1.3, Math.max(0.7, ttsRate || 0.95)),
    includesSensitive: t.include_sensitive,
  };
}

export function parseSessionConfig(raw: unknown): SessionConfig {
  const c = (raw ?? {}) as Partial<SessionConfig>;
  return {
    templateName: c.templateName ?? "Practice interview",
    introSteps: Array.isArray(c.introSteps) && c.introSteps.length ? c.introSteps : ["welcome", "media"],
    pronunciationWords: c.pronunciationWords ?? [],
    declarationText: c.declarationText ?? null,
    allowEarlySubmit: c.allowEarlySubmit ?? true,
    ttsDefault: c.ttsDefault ?? true,
    ttsRate: c.ttsRate ?? 0.95,
    includesSensitive: c.includesSensitive ?? false,
  };
}
