"use client";
/**
 * Free, local speech-to-text for recorded answers (admin browser only).
 *
 * Uses Whisper through Transformers.js (Apache-2.0), running on WebGPU when the
 * device supports it and on WebAssembly otherwise. The library is loaded from a
 * pinned CDN build at runtime (so it is not bundled into the static site) and the
 * model weights download once from the Hugging Face CDN and are cached by the
 * browser. Audio never leaves this device for transcription; no API key, no paid
 * service.
 *
 * This is speech recognition only. Question generation and answer feedback use the
 * separate WebLLM model in engine.ts.
 */
import { useSyncExternalStore } from "react";

const TRANSFORMERS_URL = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/dist/transformers.min.js";

export const WHISPER_MODELS = {
  "onnx-community/whisper-base.en": { label: "Whisper base (English, ~150 MB)" },
  "onnx-community/whisper-small.en": { label: "Whisper small (English, more accurate, ~500 MB)" },
} as const;
export type WhisperModelId = keyof typeof WHISPER_MODELS;
export const DEFAULT_WHISPER: WhisperModelId = "onnx-community/whisper-base.en";

export interface WhisperStatus {
  state: "idle" | "loading" | "ready" | "error";
  progress: number;
  text: string;
  model: WhisperModelId | null;
  device: "webgpu" | "wasm" | null;
}

let status: WhisperStatus = { state: "idle", progress: 0, text: "Not loaded", model: null, device: null };
const listeners = new Set<() => void>();
function set(p: Partial<WhisperStatus>) { status = { ...status, ...p }; listeners.forEach((l) => l()); }

export function useWhisperStatus() {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => status, () => status);
}

type Asr = (audio: Float32Array, opts: Record<string, unknown>) => Promise<{ text: string } | Array<{ text: string }>>;
let asr: { model: WhisperModelId; run: Asr } | null = null;
let loading: Promise<Asr> | null = null;

// Import from a URL at runtime without the bundler trying to resolve it.
const importUrl = new Function("u", "return import(u)") as (u: string) => Promise<Record<string, unknown>>;

async function hasWebGpu() {
  const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
  if (!gpu) return false;
  try { return !!(await gpu.requestAdapter()); } catch { return false; }
}

export async function loadWhisper(model: WhisperModelId = DEFAULT_WHISPER): Promise<Asr> {
  if (asr?.model === model) return asr.run;
  if (loading && status.model === model) return loading;
  loading = (async () => {
    set({ state: "loading", progress: 0, text: "Loading speech recognition library…", model });
    try {
      const tf = await importUrl(TRANSFORMERS_URL) as { pipeline: (task: string, model: string, opts: Record<string, unknown>) => Promise<Asr>; env: { allowLocalModels: boolean } };
      tf.env.allowLocalModels = false;
      const device = (await hasWebGpu()) ? "webgpu" : "wasm";
      set({ device, text: `Downloading ${WHISPER_MODELS[model].label} (${device === "webgpu" ? "WebGPU" : "WebAssembly"})…` });
      const files = new Map<string, { loaded: number; total: number }>();
      const run = await tf.pipeline("automatic-speech-recognition", model, {
        device,
        dtype: device === "webgpu" ? { encoder_model: "fp32", decoder_model_merged: "q4" } : "q8",
        progress_callback: (p: { status: string; file?: string; loaded?: number; total?: number }) => {
          if (p.status === "progress" && p.file && p.total) {
            files.set(p.file, { loaded: p.loaded ?? 0, total: p.total });
            const all = [...files.values()];
            set({ progress: all.reduce((a, f) => a + f.loaded, 0) / Math.max(1, all.reduce((a, f) => a + f.total, 0)) });
          }
        },
      });
      asr = { model, run };
      set({ state: "ready", progress: 1, text: `${WHISPER_MODELS[model].label} ready (${device === "webgpu" ? "WebGPU" : "WebAssembly"})` });
      return run;
    } catch (e) {
      loading = null;
      set({ state: "error", text: e instanceof Error ? e.message : "Could not load speech recognition." });
      throw e;
    }
  })();
  return loading;
}

/** Decodes any browser-playable audio file to 16 kHz mono PCM (Whisper's input). */
export async function decodeTo16kMono(data: ArrayBuffer): Promise<{ pcm: Float32Array; durationMs: number }> {
  const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctx();
  try {
    const buf = await ctx.decodeAudioData(data.slice(0));
    const length = Math.max(1, Math.ceil(buf.duration * 16000));
    const off = new OfflineAudioContext(1, length, 16000);
    const src = off.createBufferSource();
    src.buffer = buf;
    src.connect(off.destination);
    src.start();
    const out = await off.startRendering();
    return { pcm: out.getChannelData(0), durationMs: Math.round(buf.duration * 1000) };
  } finally {
    void ctx.close().catch(() => {});
  }
}

export interface TranscriptResult { text: string; status: "completed" | "no_speech"; model: string }

/**
 * Transcribes real recorded audio. Returns "no_speech" instead of text when the
 * recording has (almost) no detected speech, because Whisper can produce words
 * from silence. The text is the model's raw output: it is not rewritten or
 * corrected into better English.
 */
export async function transcribe(pcm: Float32Array, speechMs: number | null, model: WhisperModelId = DEFAULT_WHISPER): Promise<TranscriptResult> {
  if (speechMs != null && speechMs < 700) return { text: "", status: "no_speech", model };
  const run = await loadWhisper(model);
  const out = await run(pcm, { chunk_length_s: 30, stride_length_s: 5, return_timestamps: false });
  const raw = (Array.isArray(out) ? out.map((o) => o.text).join(" ") : out.text) ?? "";
  const text = cleanTranscript(raw);
  return text ? { text, status: "completed", model } : { text: "", status: "no_speech", model };
}

/** Removes Whisper's non-speech tags (e.g. "[BLANK_AUDIO]", "(music)") and spacing. Words are kept as heard. */
export function cleanTranscript(raw: string) {
  return raw.replace(/\[[^\]]*\]|\([^)]*(?:music|silence|blank|noise|inaudible)[^)]*\)/gi, " ").replace(/\s+/g, " ").trim();
}

export const wordCount = (t: string) => (t.trim() ? t.trim().split(/\s+/).length : 0);
