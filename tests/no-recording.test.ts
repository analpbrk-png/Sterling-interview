import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Product promise: video, snapshots and screen capture are never recorded.
 * Audio of answers may be recorded only with consent, and only by the single
 * audio-only recorder module below.
 */
const RECORDER = join("src", "lib", "interview", "answer-recorder.ts");
const NEVER = [/captureStream/, /getDisplayMedia/, /toDataURL/, /\.toBlob\(/, /drawImage/, /ImageCapture/, /takePhoto/];

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : /\.(tsx?|jsx?)$/.test(f) ? [p] : [];
  });
}
const code = (f: string) => readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

describe("recording boundaries", () => {
  it("no video, image or screen capture anywhere", () => {
    const offenders = files("src").flatMap((f) => NEVER.filter((re) => re.test(code(f))).map((re) => `${f}: ${re}`));
    expect(offenders).toEqual([]);
  });

  it("MediaRecorder is used only by the audio answer recorder", () => {
    const users = files("src").filter((f) => /MediaRecorder/.test(code(f)));
    expect(users).toEqual([RECORDER]);
  });

  it("the recorder records microphone tracks only", () => {
    const src = code(RECORDER);
    expect(src).toMatch(/new MediaStream\(audioTracks\)/);
    expect(src).toMatch(/new MediaRecorder\(audioOnly/);
    expect(src).not.toMatch(/getVideoTracks/);
  });

  it("recording requires consent on the server", () => {
    const fn = readFileSync("supabase/functions/invite/index.ts", "utf8");
    expect(fn).toMatch(/if \(!s\.audio_consent\) return \{ error: "Recording consent was not given/);
  });
});
