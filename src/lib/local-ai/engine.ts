"use client";
/**
 * Free local AI: an open-source model (Qwen2.5-1.5B-Instruct, Apache-2.0)
 * running in the admin's browser through WebGPU with WebLLM. The model files
 * are downloaded once from the public Hugging Face CDN and cached by the
 * browser. Prompts and CV text never leave this device. Students never load it.
 */
import { useSyncExternalStore } from "react";
import type { MLCEngineInterface } from "@mlc-ai/web-llm";

export const MODEL_F16 = "Qwen2.5-1.5B-Instruct-q4f16_1-MLC";
export const MODEL_F32 = "Qwen2.5-1.5B-Instruct-q4f32_1-MLC";
export const MODEL_LABEL = "Qwen2.5-1.5B-Instruct (Apache-2.0)";
const MIN_FREE_STORAGE = 1.6e9; // weights ~1 GB + headroom

export type AiState = "idle" | "checking" | "unsupported" | "loading" | "ready" | "error";
export interface AiStatus {
  state: AiState;
  progress: number; // 0..1 while loading
  text: string;
  model: string | null;
  cached: boolean;
}

export interface Support {
  ok: boolean;
  reason: string | null;
  model: string | null;
  details: string;
}

let status: AiStatus = { state: "idle", progress: 0, text: "Not loaded", model: null, cached: false };
const listeners = new Set<() => void>();
const set = (s: Partial<AiStatus>) => { status = { ...status, ...s }; listeners.forEach((l) => l()); };
export const getStatus = () => status;

export function useLocalAi(): AiStatus {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, getStatus, getStatus);
}

/** Checks WebGPU, GPU features and free storage before anything is downloaded. */
export async function checkSupport(): Promise<Support> {
  const nav = navigator as Navigator & { gpu?: { requestAdapter(): Promise<GPUAdapterLike | null> }; deviceMemory?: number };
  if (!nav.gpu) return { ok: false, reason: "This browser does not support WebGPU. Use a recent Chrome or Edge on a desktop or laptop.", model: null, details: "navigator.gpu missing" };
  let adapter: GPUAdapterLike | null = null;
  try { adapter = await nav.gpu.requestAdapter(); } catch { /* handled below */ }
  if (!adapter) return { ok: false, reason: "No compatible graphics adapter was found (WebGPU is disabled or blocked on this device).", model: null, details: "requestAdapter() returned null" };
  const f16 = adapter.features?.has("shader-f16") ?? false;
  const maxBuf = adapter.limits?.maxStorageBufferBindingSize ?? 0;
  if (maxBuf && maxBuf < 128 * 1024 * 1024) return { ok: false, reason: "This GPU's memory limits are too small for the local model.", model: null, details: `maxStorageBufferBindingSize=${maxBuf}` };
  if (nav.deviceMemory && nav.deviceMemory < 4) return { ok: false, reason: "This device reports less than 4 GB of memory, which is not enough for the local model.", model: null, details: `deviceMemory=${nav.deviceMemory}` };
  const model = f16 ? MODEL_F16 : MODEL_F32;
  const { hasModelInCache } = await import("@mlc-ai/web-llm");
  const cached = await hasModelInCache(model).catch(() => false);
  if (!cached) {
    const est = await navigator.storage?.estimate?.().catch(() => null);
    if (est?.quota != null && est.quota - (est.usage ?? 0) < MIN_FREE_STORAGE) {
      return { ok: false, reason: "Not enough free browser storage to download the model (about 1 GB needed).", model, details: `free=${Math.round((est.quota - (est.usage ?? 0)) / 1e6)} MB` };
    }
  }
  set({ cached });
  return { ok: true, reason: null, model, details: `${f16 ? "shader-f16" : "f32"}; ${nav.deviceMemory ? `${nav.deviceMemory} GB RAM` : "RAM unknown"}${cached ? "; model cached" : ""}` };
}
interface GPUAdapterLike { features?: { has(f: string): boolean }; limits?: { maxStorageBufferBindingSize?: number } }

let engine: MLCEngineInterface | null = null;
let loading: Promise<MLCEngineInterface> | null = null;

export async function loadEngine(): Promise<MLCEngineInterface> {
  if (engine) return engine;
  if (loading) return loading;
  loading = (async () => {
    set({ state: "checking", text: "Checking this device…", progress: 0 });
    const support = await checkSupport();
    if (!support.ok || !support.model) {
      set({ state: "unsupported", text: support.reason ?? "Unsupported device", model: null });
      throw new Error(support.reason ?? "Unsupported device");
    }
    set({ state: "loading", model: support.model, text: status.cached ? "Loading the model from this browser's cache…" : "Downloading the model (about 1 GB, first time only)…" });
    try {
      // Inference runs on the GPU via WebGPU; calls are asynchronous, so the page stays usable.
      const { CreateMLCEngine } = await import("@mlc-ai/web-llm");
      engine = await CreateMLCEngine(support.model, {
        initProgressCallback: (r) => set({ progress: r.progress, text: r.text }),
      });
      set({ state: "ready", progress: 1, text: "Model loaded on this device", cached: true });
      return engine;
    } catch (e) {
      engine = null;
      set({ state: "error", text: e instanceof Error ? e.message : "The model could not be loaded." });
      throw e;
    } finally {
      loading = null;
    }
  })();
  return loading;
}

/** Runs one chat completion constrained to a JSON schema and parses the result. */
export async function chatJson<T>(system: string, user: string, schema: object, opts: { temperature?: number; maxTokens?: number } = {}): Promise<T> {
  const eng = await loadEngine();
  const res = await eng.chat.completions.create({
    messages: [{ role: "system", content: system }, { role: "user", content: user }],
    temperature: opts.temperature ?? 0.7,
    max_tokens: opts.maxTokens ?? 900,
    response_format: { type: "json_object", schema: JSON.stringify(schema) },
  });
  const text = res.choices[0]?.message?.content ?? "";
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error("The local model returned malformed output. Try again.");
  }
}

// ---------------------------------------------------------------------------
// "Verified on this device": set only after a real test generation passes.
// ---------------------------------------------------------------------------
const VERIFIED_KEY = "localAiVerified";
export interface Verified { model: string; at: string; sample: string[] }

export function getVerified(): Verified | null {
  try { return JSON.parse(localStorage.getItem(VERIFIED_KEY) ?? "null"); } catch { return null; }
}
export function setVerified(v: Verified | null) {
  try { if (v) localStorage.setItem(VERIFIED_KEY, JSON.stringify(v)); else localStorage.removeItem(VERIFIED_KEY); } catch { /* optional */ }
}
