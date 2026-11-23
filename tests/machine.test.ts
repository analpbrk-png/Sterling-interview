import { describe, expect, it } from "vitest";
import {
  CATCH_UP_LIMIT_MS,
  effectsOf,
  formatClock,
  initialState,
  reduce,
  remainingSeconds,
  type MachineConfig,
  type MachineEvent,
  type MachineQuestion,
  type MachineState,
} from "@/lib/interview/machine";

const qs = (modes: Array<"manual" | "automatic">, prep = 20, answer = 60): MachineQuestion[] =>
  modes.map((m, i) => ({ position: i, text: `Question ${i + 1}?`, prepSeconds: prep, answerSeconds: answer, submissionMode: m }));

const cfg: MachineConfig = { introSteps: ["welcome", "media"], allowEarlySubmit: true, transitionMs: 1500 };

function run(questions: MachineQuestion[], events: MachineEvent[], config = cfg) {
  let s: MachineState = initialState(questions);
  const effects = [];
  for (const e of events) {
    const n = reduce(questions, config, s, e);
    effects.push(...effectsOf(questions, s, n));
    s = n;
  }
  return { s, effects };
}

const T0 = 1_000_000;
const intro = [{ type: "INTRO_NEXT", now: T0 }, { type: "INTRO_NEXT", now: T0 }] as MachineEvent[];

describe("interview machine", () => {
  it("walks intro steps, then opens question 1 in preparation", () => {
    const { s, effects } = run(qs(["automatic"]), intro);
    expect(s).toMatchObject({ phase: "question", index: 0, stage: "preparing", stageEndsAt: T0 + 20_000 });
    expect(effects).toContainEqual({ kind: "speak", position: 0, text: "Question 1?" });
  });

  it("20s preparation lasts 20s and the 60s answer timer starts only after it", () => {
    const q = qs(["automatic"]);
    let { s } = run(q, [...intro, { type: "TICK", now: T0 + 19_999 }]);
    expect(s).toMatchObject({ stage: "preparing" });
    expect(remainingSeconds(s, T0 + 19_999)).toBe(1);
    ({ s } = run(q, [...intro, { type: "TICK", now: T0 + 20_000 }]));
    expect(s).toMatchObject({ stage: "answering", stageStartedAt: T0 + 20_000, stageEndsAt: T0 + 80_000 });
    expect(remainingSeconds(s, T0 + 20_000)).toBe(60);
  });

  it("automatic mode advances without clicks, through a brief transition", () => {
    const q = qs(["automatic", "automatic"]);
    const { s, effects } = run(q, [
      ...intro,
      { type: "TICK", now: T0 + 20_000 },
      { type: "TICK", now: T0 + 80_000 },
    ]);
    expect(s).toMatchObject({ phase: "question", index: 0, stage: "transition" });
    expect(effects).toContainEqual({ kind: "progress", position: 0, state: "timed_out", method: "automatic" });
    const after = reduce(q, cfg, s, { type: "TICK", now: T0 + 81_500 });
    expect(after).toMatchObject({ phase: "question", index: 1, stage: "preparing", stageEndsAt: T0 + 101_500 });
  });

  it("manual mode stops the timer and waits for Submit", () => {
    const q = qs(["manual", "automatic"]);
    let { s } = run(q, [...intro, { type: "TICK", now: T0 + 20_000 }, { type: "TICK", now: T0 + 80_000 }]);
    expect(s).toMatchObject({ stage: "awaiting_submit", stageEndsAt: null });
    // time passing changes nothing
    s = reduce(q, cfg, s, { type: "TICK", now: T0 + 500_000 });
    expect(s).toMatchObject({ phase: "question", index: 0, stage: "awaiting_submit" });
    s = reduce(q, cfg, s, { type: "SUBMIT", index: 0, now: T0 + 500_000 });
    expect(s).toMatchObject({ phase: "question", index: 1, stage: "preparing" });
  });

  it("ignores double submissions and stale submits", () => {
    const q = qs(["manual", "manual", "manual"]);
    let { s } = run(q, [...intro, { type: "TICK", now: T0 + 20_000 }, { type: "TICK", now: T0 + 80_000 }]);
    s = reduce(q, cfg, s, { type: "SUBMIT", index: 0, now: T0 + 81_000 });
    const again = reduce(q, cfg, s, { type: "SUBMIT", index: 0, now: T0 + 81_001 });
    expect(again).toBe(s); // same object: nothing happened
    expect(s).toMatchObject({ index: 1, stage: "preparing" });
  });

  it("early submit only during answer time and only when allowed", () => {
    const q = qs(["manual", "manual"]);
    let { s } = run(q, intro);
    expect(reduce(q, cfg, s, { type: "SUBMIT", index: 0, now: T0 + 1 })).toBe(s); // still preparing
    s = reduce(q, cfg, s, { type: "TICK", now: T0 + 20_000 });
    const noEarly = reduce(q, { ...cfg, allowEarlySubmit: false }, s, { type: "SUBMIT", index: 0, now: T0 + 30_000 });
    expect(noEarly).toBe(s);
    const early = reduce(q, cfg, s, { type: "SUBMIT", index: 0, now: T0 + 30_000 });
    expect(early.outcomes[0]).toEqual({ state: "completed", method: "early" });
  });

  it("final question leads to completion", () => {
    const q = qs(["automatic"]);
    const { s, effects } = run(q, [...intro, { type: "TICK", now: T0 + 20_000 }, { type: "TICK", now: T0 + 80_000 }]);
    expect(s.phase).toBe("completed");
    expect(effects.at(-1)).toEqual({ kind: "session_complete" });
  });

  it("zero preparation opens straight into answer time", () => {
    const q = qs(["automatic"], 0, 90);
    const { s, effects } = run(q, intro);
    expect(s).toMatchObject({ stage: "answering", stageEndsAt: T0 + 90_000 });
    expect(effects.filter((e) => e.kind === "answer_cue")).toHaveLength(1);
  });

  it("a throttled timer that fires late keeps the original deadlines", () => {
    const q = qs(["automatic", "automatic"]);
    // timer fired 1.2s late: answer deadline is still prep end + 60s
    const { s } = run(q, [...intro, { type: "TICK", now: T0 + 21_200 }]);
    expect(s).toMatchObject({ stage: "answering", stageEndsAt: T0 + 80_000 });
  });

  it("after device sleep, never skips a whole question silently", () => {
    const q = qs(["automatic", "automatic", "automatic"]);
    const wake = T0 + 10 * 60_000;
    const { s } = run(q, [...intro, { type: "TICK", now: wake }]);
    // preparation ended while asleep → student gets the full answer time from wake-up
    expect(s).toMatchObject({ index: 0, stage: "answering", stageStartedAt: wake, stageEndsAt: wake + 60_000 });
    expect(CATCH_UP_LIMIT_MS).toBeLessThan(5000);
    // sleeping through an answer completes only that question, then restarts fresh
    const s2 = reduce(q, cfg, s, { type: "TICK", now: wake + 20 * 60_000 });
    expect(s2).toMatchObject({ index: 1, stage: "preparing", stageStartedAt: wake + 20 * 60_000 });
    expect(s2.outcomes).toEqual([{ state: "timed_out", method: "automatic" }, null, null]);
  });

  it("emits progress in order exactly once per stage", () => {
    const q = qs(["automatic", "manual"]);
    const { effects } = run(q, [
      ...intro,
      { type: "TICK", now: T0 + 20_000 },
      { type: "TICK", now: T0 + 20_250 },
      { type: "TICK", now: T0 + 80_000 },
      { type: "TICK", now: T0 + 81_500 },
      { type: "TICK", now: T0 + 101_500 },
      { type: "TICK", now: T0 + 161_500 },
      { type: "SUBMIT", index: 1, now: T0 + 170_000 },
      { type: "SUBMIT", index: 1, now: T0 + 170_001 },
    ]);
    const progress = effects.filter((e) => e.kind === "progress").map((e) => `${e.position}:${e.state}`);
    expect(progress).toEqual([
      "0:preparing", "0:answering", "0:timed_out",
      "1:preparing", "1:answering", "1:awaiting_submit", "1:completed",
    ]);
  });

  it("formats clock", () => {
    expect(formatClock(20)).toBe("00:20");
    expect(formatClock(150)).toBe("02:30");
  });
});
