"use client";
import { Button, Card, Notice } from "@/components/ui";
import { formatDuration } from "@/lib/format";

export interface CompletionData {
  questionsCompleted: number;
  questionCount: number;
  durationSeconds: number;
  saved: "saving" | "saved" | "failed" | "preview";
}

/** Summary only. No scores or feedback: answers were never captured or analysed. */
export function Completion({ data, universityName, courseName, onDone, onAgain, onRetrySave }: {
  data: CompletionData;
  universityName: string;
  courseName: string;
  onDone: () => void;
  onAgain?: () => void;
  onRetrySave: () => void;
}) {
  const rows: Array<[string, string]> = [
    ["Questions completed", `${data.questionsCompleted} of ${data.questionCount}`],
    ["University", universityName],
    ["Course", courseName],
    ["Total session duration", formatDuration(data.durationSeconds)],
    ["Completion status", data.questionsCompleted === data.questionCount ? "Completed" : "Partially completed"],
  ];
  return (
    <div className="min-h-dvh grid place-items-center px-4 py-12">
      <Card className="w-full max-w-lg p-6 sm:p-8 text-center">
        <div aria-hidden className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-accent text-accent-ink text-2xl">✓</div>
        <h1 className="mt-5 text-2xl font-semibold tracking-tight">Interview Completed</h1>
        <p className="mt-2 text-muted">Well done! You have completed your mock interview.</p>
        <dl className="mt-6 divide-y divide-line rounded-xl border border-line text-left text-sm">
          {rows.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4 px-4 py-3">
              <dt className="text-muted">{k}</dt>
              <dd className="font-medium text-ink text-right">{v}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-4 text-xs text-muted">Your camera and microphone have been turned off. Nothing was recorded. Your adviser can see that you completed the interview.</p>
        {data.saved === "saving" && <p className="mt-3 text-xs text-muted">Saving session summary…</p>}
        {data.saved === "preview" && <div className="mt-4"><Notice tone="warn">Preview mode: nothing was saved.</Notice></div>}
        {data.saved === "failed" && (
          <div className="mt-4 grid gap-2">
            <Notice tone="warn">We could not save the session summary. Check your connection.</Notice>
            <Button variant="secondary" onClick={onRetrySave}>Try saving again</Button>
          </div>
        )}
        <div className="mt-7 flex flex-col sm:flex-row gap-3 justify-center">
          <Button onClick={onDone}>Done</Button>
          {onAgain && <Button variant="secondary" onClick={onAgain}>Practice Again</Button>}
        </div>
      </Card>
    </div>
  );
}
