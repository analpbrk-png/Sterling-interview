import { describe, expect, it } from "vitest";
import { ProgressQueue, type ProgressItem } from "@/lib/interview/progress-queue";

const item = (position: number, state: ProgressItem["state"]): ProgressItem => ({ position, state, clientTs: "t" });

describe("progress queue", () => {
  it("delivers in order and retries failures without reordering", async () => {
    const delivered: string[] = [];
    let failures = 2;
    const q = new ProgressQueue(
      async (i) => {
        if (i.state === "answering" && failures-- > 0) throw new Error("offline");
        delivered.push(`${i.position}:${i.state}`);
      },
      () => {},
      [1],
      async () => {},
    );
    q.push(item(0, "preparing"));
    q.push(item(0, "answering"));
    q.push(item(0, "timed_out"));
    q.push(item(1, "preparing"));
    await q.drained();
    expect(delivered).toEqual(["0:preparing", "0:answering", "0:timed_out", "1:preparing"]);
    expect(q.pending).toBe(0);
  });
});
