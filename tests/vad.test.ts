import { describe, expect, it } from "vitest";
import { classifyFrames, framesFromPcm } from "../src/lib/interview/vad";

const frames = (pattern: Array<[number, number]>) => pattern.flatMap(([db, ms]) => Array.from({ length: Math.round(ms / 30) }, () => ({ db, ms: 30 })));

describe("voice activity detection", () => {
  it("measures speech separately from silence", () => {
    // 2 s quiet room, 3 s speech, 1 s quiet
    const r = classifyFrames(frames([[-60, 2000], [-25, 3000], [-60, 1000]]));
    expect(r.speechMs).toBeGreaterThan(2800);
    expect(r.speechMs).toBeLessThan(3200);
    expect(r.silenceMs).toBeGreaterThan(2800);
    expect(r.speechIsEstimate).toBe(false);
  });

  it("bridges short pauses between words but not long silences", () => {
    const short = classifyFrames(frames([[-60, 1500], [-25, 1000], [-60, 210], [-25, 1000], [-60, 1500]]));
    expect(short.speechMs).toBeGreaterThan(2100);
    const long = classifyFrames(frames([[-60, 1500], [-25, 1000], [-60, 1500], [-25, 1000], [-60, 1500]]));
    expect(long.speechMs).toBeLessThan(2200);
  });

  it("ignores short clicks", () => {
    const r = classifyFrames(frames([[-60, 3000], [-20, 60], [-60, 3000]]));
    expect(r.speechMs).toBe(0);
  });

  it("silence-only recordings have no speech", () => {
    expect(classifyFrames(frames([[-62, 5000]])).speechMs).toBe(0);
  });

  it("flags noisy recordings as estimates", () => {
    const r = classifyFrames(frames([[-30, 2000], [-24, 3000], [-30, 2000]]));
    expect(r.speechIsEstimate).toBe(true);
  });

  it("builds frames from PCM", () => {
    const sr = 16000;
    const pcm = new Float32Array(sr * 2);
    for (let i = sr; i < 2 * sr; i++) pcm[i] = 0.1 * Math.sin(i / 5);
    const r = classifyFrames(framesFromPcm(pcm, sr));
    expect(r.speechMs).toBeGreaterThan(900);
    expect(r.speechMs).toBeLessThan(1100);
  });
});
