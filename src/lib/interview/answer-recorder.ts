"use client";
/**
 * Consent-based, audio-only recording of one answer at a time.
 *
 * - The ONLY place in the app that uses MediaRecorder (see tests/no-recording.test.ts).
 * - Records a new MediaStream built from the microphone track(s) only: video is never
 *   passed to the recorder, so the camera preview is never captured.
 * - Runs a simple voice activity detector (VAD) on the same microphone signal while
 *   recording, so speaking time is measured from the audio, not from the countdown.
 */
import { createVad, type VadResult } from "./vad";

export interface AudioFormat {
  /** Value passed to MediaRecorder (may include codecs). */
  recorderMime: string | undefined;
  /** Container type stored and sent to the server, e.g. "audio/webm". */
  baseMime: string;
}

const CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4;codecs=mp4a.40.2",
  "audio/mp4",
  "audio/ogg;codecs=opus",
  "audio/aac",
];
const SERVER_TYPES = ["audio/webm", "audio/ogg", "audio/mp4", "audio/aac", "audio/mpeg", "audio/wav"];

export function recordingSupported() {
  return typeof window !== "undefined" && typeof window.MediaRecorder !== "undefined";
}

/** Picks a format this browser can record (Chrome/Android: webm/opus; Safari/iPhone: mp4/aac). */
export function pickAudioFormat(): AudioFormat | null {
  if (!recordingSupported()) return null;
  const isSupported = (t: string) => { try { return MediaRecorder.isTypeSupported(t); } catch { return false; } };
  for (const t of CANDIDATES) if (isSupported(t)) return { recorderMime: t, baseMime: t.split(";")[0] };
  // Older browsers without isTypeSupported answers: let the browser choose, read it after start.
  return { recorderMime: undefined, baseMime: "" };
}

export function normaliseMime(m: string) {
  const base = m.split(";")[0].trim().toLowerCase();
  if (base === "audio/x-m4a" || base === "audio/m4a") return "audio/mp4";
  if (base === "video/webm") return "audio/webm"; // some browsers label audio-only webm as video/webm
  if (base === "video/mp4") return "audio/mp4";
  return base;
}

export interface RecordedAnswer extends VadResult {
  position: number;
  blob: Blob;
  mime: string;
  recordedMs: number;
  partial: boolean;
  error: string | null;
}

export class AnswerRecorder {
  private rec: MediaRecorder | null = null;
  private chunks: BlobPart[] = [];
  private startedAt = 0;
  private stopVad: (() => VadResult) | null = null;
  private done: Promise<RecordedAnswer> | null = null;
  private failure: string | null = null;
  readonly position: number;
  readonly partial: boolean;

  constructor(position: number, partial: boolean) {
    this.position = position;
    this.partial = partial;
  }

  /** Starts recording the microphone only. Throws if recording cannot start. */
  start(stream: MediaStream, format: AudioFormat) {
    const audioTracks = stream.getAudioTracks().filter((t) => t.readyState === "live");
    if (!audioTracks.length) throw new Error("No live microphone.");
    const audioOnly = new MediaStream(audioTracks);
    const rec = new MediaRecorder(audioOnly, { ...(format.recorderMime ? { mimeType: format.recorderMime } : {}), audioBitsPerSecond: 64_000 });
    this.rec = rec;
    this.chunks = [];
    let resolve!: (r: RecordedAnswer) => void;
    this.done = new Promise((r) => (resolve = r));
    rec.ondataavailable = (e) => { if (e.data && e.data.size) this.chunks.push(e.data); };
    rec.onerror = () => { this.failure = "The browser stopped the recording."; };
    rec.onstop = () => {
      const vad = this.stopVad?.() ?? { speechMs: 0, silenceMs: 0, speechIsEstimate: true, vad: { detector: "none" } };
      const recordedMs = Math.max(0, Date.now() - this.startedAt);
      const mime = normaliseMime(rec.mimeType || format.baseMime || "audio/webm");
      const blob = new Blob(this.chunks, { type: mime });
      const error = this.failure ?? (blob.size === 0 ? "No audio was captured." : !SERVER_TYPES.includes(mime) ? `Unsupported audio format (${mime}).` : null);
      // Speech can never exceed the recording itself.
      const speechMs = Math.min(vad.speechMs, recordedMs);
      resolve({ ...vad, speechMs, silenceMs: Math.max(0, recordedMs - speechMs), position: this.position, blob, mime, recordedMs, partial: this.partial, error });
    };
    // A timeslice keeps data flowing so an interrupted recording still yields what was captured.
    rec.start(1000);
    this.startedAt = Date.now();
    this.stopVad = createVad(audioOnly);
    // If the microphone disappears (unplugged, OS interruption), finish with what we have.
    audioTracks.forEach((t) => t.addEventListener("ended", () => { this.failure ??= "The microphone stopped during the answer."; this.stop(); }, { once: true }));
  }

  get active() {
    return this.rec?.state === "recording";
  }

  /** Stops (idempotent) and resolves with the finished answer. */
  stop(): Promise<RecordedAnswer> {
    if (this.rec && this.rec.state !== "inactive") {
      try { this.rec.requestData(); } catch { /* optional */ }
      this.rec.stop();
    }
    return this.done ?? Promise.reject(new Error("Recording never started."));
  }
}
