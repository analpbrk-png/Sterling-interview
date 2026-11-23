/**
 * Sends progress updates strictly in order. A failed send (offline, server
 * error) is retried with backoff while later updates wait, so the server never
 * sees question N+1 start before question N finished. Updates are idempotent
 * on the server, so a retry after an ambiguous failure is safe.
 */
export interface ProgressItem {
  position: number;
  state: "preparing" | "answering" | "awaiting_submit" | "completed" | "timed_out";
  method?: "manual" | "automatic" | "early";
  clientTs?: string;
}

export type QueueStatus = "idle" | "sending" | "retrying";

export class ProgressQueue {
  private items: ProgressItem[] = [];
  private running = false;
  private waiters: Array<() => void> = [];
  status: QueueStatus = "idle";

  constructor(
    private send: (item: ProgressItem) => Promise<void>,
    private onStatus: (s: QueueStatus) => void = () => {},
    private delays = [500, 1000, 2000, 4000, 8000, 15000],
    private sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms)),
  ) {}

  push(item: ProgressItem) {
    this.items.push(item);
    void this.run();
  }

  get pending() {
    return this.items.length;
  }

  /** Resolves once everything queued so far has been delivered. */
  drained(): Promise<void> {
    if (!this.items.length && !this.running) return Promise.resolve();
    return new Promise((r) => this.waiters.push(r));
  }

  private setStatus(s: QueueStatus) {
    this.status = s;
    this.onStatus(s);
  }

  private async run() {
    if (this.running) return;
    this.running = true;
    let attempt = 0;
    while (this.items.length) {
      this.setStatus(attempt ? "retrying" : "sending");
      try {
        await this.send(this.items[0]);
        this.items.shift();
        attempt = 0;
      } catch {
        await this.sleep(this.delays[Math.min(attempt, this.delays.length - 1)]);
        attempt++;
      }
    }
    this.running = false;
    this.setStatus("idle");
    this.waiters.splice(0).forEach((w) => w());
  }
}
