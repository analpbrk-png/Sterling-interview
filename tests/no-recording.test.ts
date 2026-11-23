import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/** The product promise: no video/audio recording, snapshots or screen capture anywhere in the app. */
const FORBIDDEN = [/MediaRecorder/, /captureStream/, /getDisplayMedia/, /toDataURL/, /\.toBlob\(/, /drawImage/, /ImageCapture/, /takePhoto/];

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : /\.(tsx?|jsx?)$/.test(f) ? [p] : [];
  });
}

describe("no recording", () => {
  it("source never uses recording or capture APIs", () => {
    const offenders = files("src").flatMap((f) => {
      // Comments may mention these APIs (to say they are not used); code may not.
      const text = readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
      return FORBIDDEN.filter((re) => re.test(text)).map((re) => `${f}: ${re}`);
    });
    expect(offenders).toEqual([]);
  });

  it("schema has no table or bucket for recordings", () => {
    const sql = readFileSync("supabase/migrations/20261123000001_init.sql", "utf8").replace(/--.*$/gm, "").toLowerCase();
    expect(sql).not.toMatch(/recording|video_url|audio_url|snapshot/);
  });
});
