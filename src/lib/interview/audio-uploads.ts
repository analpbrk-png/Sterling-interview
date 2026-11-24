"use client";
/**
 * Uploads recorded answers one at a time, retrying on failure. Each answer is
 * kept in IndexedDB on this device until the server confirms it was stored,
 * so a refresh or a dropped connection does not lose it. An answer is only
 * reported "saved" after the server has checked the stored file.
 */
import type { RecordedAnswer } from "./answer-recorder";

export type UploadState = "queued" | "uploading" | "saved" | "failed";
export interface UploadStatus { position: number; state: UploadState; error?: string }

export interface AudioUploadApi {
  begin(meta: { position: number; mime: string; recordedMs: number; speechMs: number; silenceMs: number; speechIsEstimate: boolean; vad: Record<string, unknown>; partial: boolean }):
    Promise<{ recordingId: string; alreadyUploaded?: boolean; path?: string; uploadToken?: string; bucket?: string }>;
  put(bucket: string, path: string, token: string, blob: Blob, contentType: string): Promise<void>;
  finish(position: number, recordingId: string): Promise<void>;
}

interface Stored { key: string; sessionId: string; answer: Omit<RecordedAnswer, "error"> }

const DB_NAME = "interview-audio";
const STORE = "pending";

function idb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "key" });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null); // private mode / blocked storage: uploads still work, just not across refresh
    }
  });
}
async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | null> {
  const db = await idb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const r = fn(db.transaction(STORE, mode).objectStore(STORE));
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export class AudioUploadQueue {
  private items: Stored[] = [];
  private failed: Stored[] = [];
  private running = false;
  private statuses = new Map<number, UploadStatus>();
  private waiters: Array<() => void> = [];
  private stopped = false;

  constructor(
    private sessionId: string,
    private api: AudioUploadApi,
    private onChange: (s: UploadStatus[]) => void,
    private delays = [1000, 2000, 4000, 8000, 15000, 30000],
  ) {}

  /** Re-queues answers left on this device by an earlier page load of the same session. */
  async restore() {
    const all = (await tx<Stored[]>("readonly", (s) => s.getAll() as IDBRequest<Stored[]>)) ?? [];
    for (const it of all.filter((x) => x.sessionId === this.sessionId)) {
      if (!this.items.some((x) => x.key === it.key)) { this.items.push(it); this.set(it.answer.position, "queued"); }
    }
    void this.run();
  }

  async add(answer: RecordedAnswer) {
    const key = `${this.sessionId}:${answer.position}`;
    if (answer.error) { this.set(answer.position, "failed", answer.error); return; }
    const { error: _e, ...rest } = answer;
    void _e;
    const item: Stored = { key, sessionId: this.sessionId, answer: rest };
    this.items = this.items.filter((x) => x.key !== key);
    this.items.push(item);
    this.set(answer.position, "queued");
    await tx("readwrite", (s) => s.put(item));
    void this.run();
  }

  retryFailed() {
    for (const it of this.failed.splice(0)) { this.items.push(it); this.set(it.answer.position, "queued"); }
    void this.run();
  }

  get list() { return [...this.statuses.values()].sort((a, b) => a.position - b.position); }
  get pending() { return this.items.length; }
  get failedCount() { return this.failed.length; }

  drained(): Promise<void> {
    if (!this.items.length) return Promise.resolve();
    return new Promise((r) => this.waiters.push(r));
  }

  dispose() { this.stopped = true; }

  private set(position: number, state: UploadState, error?: string) {
    this.statuses.set(position, { position, state, error });
    this.onChange(this.list);
  }

  private async uploadOne(it: Stored) {
    const a = it.answer;
    const begin = await this.api.begin({ position: a.position, mime: a.mime, recordedMs: a.recordedMs, speechMs: a.speechMs, silenceMs: a.silenceMs, speechIsEstimate: a.speechIsEstimate, vad: a.vad, partial: a.partial });
    if (!begin.alreadyUploaded) {
      await this.api.put(begin.bucket!, begin.path!, begin.uploadToken!, a.blob, a.mime);
      await this.api.finish(a.position, begin.recordingId);
    }
  }

  private async run() {
    if (this.running) return;
    this.running = true;
    let attempt = 0;
    while (this.items.length && !this.stopped) {
      const it = this.items[0];
      this.set(it.answer.position, "uploading");
      try {
        await this.uploadOne(it);
        this.items.shift();
        attempt = 0;
        await tx("readwrite", (s) => s.delete(it.key));
        this.set(it.answer.position, "saved");
      } catch (e) {
        const permanent = e instanceof Error && (e as Error & { permanent?: boolean }).permanent;
        if (permanent || attempt >= this.delays.length) {
          // Keep it on the device; the student (or a later page load) can retry.
          this.items.shift();
          this.set(it.answer.position, "failed", e instanceof Error ? e.message : "Upload failed");
          if (permanent) await tx("readwrite", (s) => s.delete(it.key));
          else this.failed.push(it);
          attempt = 0;
          continue;
        }
        await new Promise((r) => setTimeout(r, this.delays[attempt]));
        attempt++;
      }
    }
    this.running = false;
    if (!this.items.length) this.waiters.splice(0).forEach((w) => w());
  }
}
