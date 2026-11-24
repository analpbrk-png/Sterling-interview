/**
 * Energy-based voice activity detection.
 *
 * Input: a sequence of frames, each with its loudness (RMS, dBFS) and duration.
 * 1. Noise floor = 10th percentile of frame loudness (the quiet parts of the recording).
 * 2. A frame is speech when it is at least SPEECH_OVER_FLOOR_DB above the floor and
 *    above an absolute minimum (very quiet rooms).
 * 3. Smoothing: short gaps inside speech (< GAP_FILL_MS, natural pauses between words)
 *    count as speech; isolated blips (< MIN_SPEECH_MS, clicks/bumps) do not.
 * 4. The result is flagged as an estimate when speech and background are not clearly
 *    separated (noisy room) or frames were missed (tab in background).
 */
export const VAD_VERSION = "energy-v1";
export const SPEECH_OVER_FLOOR_DB = 10;
export const ABSOLUTE_MIN_DB = -50;
export const GAP_FILL_MS = 300;
export const MIN_SPEECH_MS = 150;
export const CONFIDENT_SEPARATION_DB = 15;

export interface VadFrame { db: number; ms: number }
export interface VadResult {
  speechMs: number;
  silenceMs: number;
  speechIsEstimate: boolean;
  vad: Record<string, unknown>;
}

const percentile = (sorted: number[], p: number) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] : -100);

export function rmsDb(samples: ArrayLike<number>, from = 0, to = samples.length) {
  let sum = 0;
  for (let i = from; i < to; i++) sum += samples[i] * samples[i];
  const rms = Math.sqrt(sum / Math.max(1, to - from));
  return rms > 0 ? 20 * Math.log10(rms) : -100;
}

export function classifyFrames(frames: VadFrame[], opts: { missedFrames?: boolean } = {}): VadResult {
  const total = frames.reduce((a, f) => a + f.ms, 0);
  if (!frames.length || total === 0) return { speechMs: 0, silenceMs: 0, speechIsEstimate: true, vad: { version: VAD_VERSION, frames: 0 } };
  const sorted = frames.map((f) => f.db).sort((a, b) => a - b);
  const floor = percentile(sorted, 0.1);
  const loud = percentile(sorted, 0.9);
  const threshold = Math.max(floor + SPEECH_OVER_FLOOR_DB, ABSOLUTE_MIN_DB);
  const isSpeech = frames.map((f) => f.db > threshold);

  // Fill short gaps between speech frames.
  let i = 0;
  while (i < frames.length) {
    if (isSpeech[i]) { i++; continue; }
    let j = i, gap = 0;
    while (j < frames.length && !isSpeech[j]) { gap += frames[j].ms; j++; }
    if (i > 0 && j < frames.length && gap < GAP_FILL_MS) for (let k = i; k < j; k++) isSpeech[k] = true;
    i = j;
  }
  // Drop very short speech runs.
  i = 0;
  while (i < frames.length) {
    if (!isSpeech[i]) { i++; continue; }
    let j = i, run = 0;
    while (j < frames.length && isSpeech[j]) { run += frames[j].ms; j++; }
    if (run < MIN_SPEECH_MS) for (let k = i; k < j; k++) isSpeech[k] = false;
    i = j;
  }
  const speechMs = Math.round(frames.reduce((a, f, k) => a + (isSpeech[k] ? f.ms : 0), 0));
  const separation = loud - floor;
  const speechIsEstimate = separation < CONFIDENT_SEPARATION_DB || floor > -35 || !!opts.missedFrames;
  return {
    speechMs,
    silenceMs: Math.max(0, Math.round(total) - speechMs),
    speechIsEstimate,
    vad: {
      version: VAD_VERSION,
      frames: frames.length,
      noiseFloorDb: Math.round(floor * 10) / 10,
      loudDb: Math.round(loud * 10) / 10,
      thresholdDb: Math.round(threshold * 10) / 10,
      separationDb: Math.round(separation * 10) / 10,
      missedFrames: !!opts.missedFrames,
    },
  };
}

/** Frames from decoded PCM (admin side, measured from the stored file). */
export function framesFromPcm(samples: Float32Array, sampleRate: number, frameMs = 30): VadFrame[] {
  const size = Math.max(1, Math.round((sampleRate * frameMs) / 1000));
  const out: VadFrame[] = [];
  for (let s = 0; s < samples.length; s += size) {
    const e = Math.min(samples.length, s + size);
    out.push({ db: rmsDb(samples, s, e), ms: ((e - s) / sampleRate) * 1000 });
  }
  return out;
}

/** Live detector on a microphone stream (student side). Returns a stop() that classifies. */
export function createVad(stream: MediaStream): () => VadResult {
  const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return () => ({ speechMs: 0, silenceMs: 0, speechIsEstimate: true, vad: { version: VAD_VERSION, unavailable: true } });
  const ctx = new Ctx();
  const source = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 2048;
  source.connect(analyser);
  void ctx.resume().catch(() => {});
  const buf = new Float32Array(analyser.fftSize);
  const frames: VadFrame[] = [];
  let last = performance.now();
  let missed = false;
  const id = window.setInterval(() => {
    const now = performance.now();
    const dt = now - last;
    last = now;
    if (dt > 250) missed = true; // timers throttled (tab hidden / device busy)
    analyser.getFloatTimeDomainData(buf);
    frames.push({ db: rmsDb(buf), ms: Math.min(dt, 250) });
  }, 30);
  return () => {
    window.clearInterval(id);
    const wasRunning = ctx.state === "running";
    source.disconnect();
    void ctx.close().catch(() => {});
    return classifyFrames(frames, { missedFrames: missed || !wasRunning });
  };
}
