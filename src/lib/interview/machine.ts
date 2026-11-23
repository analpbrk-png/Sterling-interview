/**
 * Deterministic interview state machine.
 *
 * Time is passed in (never read inside), so every transition is reproducible
 * in tests. Stages end at absolute deadlines (epoch ms), which keeps the
 * countdown correct when the browser throttles timers or the tab is hidden.
 * Every event that targets a question carries its index; stale or duplicate
 * events (double clicks, a late timer tick) are ignored.
 */

export type SubmissionMode = "manual" | "automatic";

export interface MachineQuestion {
  position: number;
  text: string;
  prepSeconds: number;
  answerSeconds: number;
  submissionMode: SubmissionMode;
}

export type IntroStep = "welcome" | "media" | "passport" | "name_id" | "pronunciation" | "declaration";

export interface MachineConfig {
  introSteps: IntroStep[];
  allowEarlySubmit: boolean;
  transitionMs: number;
}

export type QuestionOutcome = { state: "completed" | "timed_out"; method: "manual" | "automatic" | "early" };

export type Stage = "preparing" | "answering" | "awaiting_submit" | "transition";

export type MachineState =
  | { phase: "intro"; step: number; outcomes: (QuestionOutcome | null)[] }
  | {
      phase: "question";
      index: number;
      stage: Stage;
      stageStartedAt: number;
      stageEndsAt: number | null; // null while awaiting a manual submit
      outcomes: (QuestionOutcome | null)[];
    }
  | { phase: "completed"; completedAt: number; outcomes: (QuestionOutcome | null)[] };

export type MachineEvent =
  | { type: "INTRO_NEXT"; now: number }
  | { type: "INTRO_BACK" }
  | { type: "TICK"; now: number }
  | { type: "SUBMIT"; index: number; now: number };

/** If a deadline was missed by more than this, the device probably slept. */
export const CATCH_UP_LIMIT_MS = 2000;

/** Every interview opens on its intro steps (at minimum the welcome screen). */
export function initialState(questions: MachineQuestion[]): MachineState {
  return { phase: "intro", step: 0, outcomes: questions.map(() => null) };
}

function startQuestion(
  questions: MachineQuestion[],
  index: number,
  at: number,
  outcomes: (QuestionOutcome | null)[],
): MachineState {
  if (index >= questions.length) return { phase: "completed", completedAt: at, outcomes };
  const q = questions[index];
  if (q.prepSeconds <= 0) {
    return { phase: "question", index, stage: "answering", stageStartedAt: at, stageEndsAt: at + q.answerSeconds * 1000, outcomes };
  }
  return { phase: "question", index, stage: "preparing", stageStartedAt: at, stageEndsAt: at + q.prepSeconds * 1000, outcomes };
}

function finish(
  questions: MachineQuestion[],
  config: MachineConfig,
  s: Extract<MachineState, { phase: "question" }>,
  outcome: QuestionOutcome,
  at: number,
): MachineState {
  const outcomes = s.outcomes.slice();
  outcomes[s.index] = outcome;
  const isLast = s.index === questions.length - 1;
  if (isLast) return { phase: "completed", completedAt: at, outcomes };
  if (config.transitionMs > 0 && outcome.method === "automatic") {
    return { ...s, stage: "transition", stageStartedAt: at, stageEndsAt: at + config.transitionMs, outcomes };
  }
  return startQuestion(questions, s.index + 1, at, outcomes);
}

function advanceExpired(questions: MachineQuestion[], config: MachineConfig, s: MachineState, now: number): MachineState {
  // At most a handful of steps per tick; the loop handles a single question's
  // stages that all elapsed while the tab was hidden.
  for (let guard = 0; guard < 4; guard++) {
    if (s.phase !== "question" || s.stageEndsAt == null || now < s.stageEndsAt) return s;
    const q = questions[s.index];
    const lateBy = now - s.stageEndsAt;
    // After a long pause (sleep), restart the next stage from "now" instead of
    // silently consuming the student's time.
    const at = lateBy > CATCH_UP_LIMIT_MS ? now : s.stageEndsAt;

    if (s.stage === "preparing") {
      s = { ...s, stage: "answering", stageStartedAt: at, stageEndsAt: at + q.answerSeconds * 1000 };
      if (lateBy > CATCH_UP_LIMIT_MS) return s; // give the full answer time after waking
      continue;
    }
    if (s.stage === "answering") {
      if (q.submissionMode === "manual") {
        return { ...s, stage: "awaiting_submit", stageStartedAt: at, stageEndsAt: null };
      }
      s = finish(questions, config, s, { state: "timed_out", method: "automatic" }, at);
      if (lateBy > CATCH_UP_LIMIT_MS && s.phase === "question" && s.stage === "transition") {
        return startQuestion(questions, s.index + 1, now, s.outcomes);
      }
      continue;
    }
    if (s.stage === "transition") {
      s = startQuestion(questions, s.index + 1, at, s.outcomes);
      continue;
    }
    return s;
  }
  return s;
}

export function reduce(
  questions: MachineQuestion[],
  config: MachineConfig,
  state: MachineState,
  event: MachineEvent,
): MachineState {
  switch (event.type) {
    case "INTRO_NEXT": {
      if (state.phase !== "intro") return state;
      const next = state.step + 1;
      if (next < config.introSteps.length) return { ...state, step: next };
      return startQuestion(questions, 0, event.now, state.outcomes);
    }
    case "INTRO_BACK": {
      if (state.phase !== "intro" || state.step === 0) return state;
      return { ...state, step: state.step - 1 };
    }
    case "TICK":
      return advanceExpired(questions, config, state, event.now);
    case "SUBMIT": {
      if (state.phase !== "question" || state.index !== event.index) return state;
      if (state.stage === "awaiting_submit") {
        return finish(questions, config, state, { state: "completed", method: "manual" }, event.now);
      }
      if (state.stage === "answering" && config.allowEarlySubmit) {
        return finish(questions, config, state, { state: "completed", method: "early" }, event.now);
      }
      return state;
    }
  }
}

/** Starts the machine at a given question (used when resuming after a refresh). */
export function resumeAt(questions: MachineQuestion[], index: number, now: number, outcomes?: (QuestionOutcome | null)[]): MachineState {
  return startQuestion(questions, index, now, outcomes ?? questions.map(() => null));
}

// ---------------------------------------------------------------------------
// Side effects derived from a transition (kept pure so they can be tested).
// ---------------------------------------------------------------------------
export type Effect =
  | { kind: "progress"; position: number; state: "preparing" | "answering" | "awaiting_submit" | "completed" | "timed_out"; method?: QuestionOutcome["method"] }
  | { kind: "speak"; position: number; text: string }
  | { kind: "answer_cue" }
  | { kind: "session_complete" };

export function effectsOf(questions: MachineQuestion[], prev: MachineState, next: MachineState): Effect[] {
  if (prev === next) return [];
  const effects: Effect[] = [];
  // Newly finished questions.
  next.outcomes.forEach((o, i) => {
    if (o && !prev.outcomes[i]) {
      effects.push({ kind: "progress", position: questions[i].position, state: o.state, method: o.method });
    }
  });
  const prevKey = prev.phase === "question" ? `${prev.index}:${prev.stage}` : prev.phase;
  if (next.phase === "question") {
    const key = `${next.index}:${next.stage}`;
    const q = questions[next.index];
    const enteredQuestion = !(prev.phase === "question" && prev.index === next.index);
    if (enteredQuestion) {
      effects.push({ kind: "speak", position: q.position, text: q.text });
      // When prep is zero the question opens directly in answer time.
      effects.push({ kind: "progress", position: q.position, state: "preparing" });
    }
    if (key !== prevKey) {
      if (next.stage === "answering") {
        effects.push({ kind: "progress", position: q.position, state: "answering" });
        effects.push({ kind: "answer_cue" });
      }
      if (next.stage === "awaiting_submit") effects.push({ kind: "progress", position: q.position, state: "awaiting_submit" });
    }
  }
  if (next.phase === "completed" && prev.phase !== "completed") effects.push({ kind: "session_complete" });
  return effects;
}

export function remainingSeconds(state: MachineState, now: number): number | null {
  if (state.phase !== "question" || state.stageEndsAt == null) return null;
  return Math.max(0, Math.ceil((state.stageEndsAt - now) / 1000));
}

export function formatClock(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
