export function formatDate(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

export function formatDuration(seconds: number | null | undefined) {
  if (seconds == null) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m ? `${m} min ${s.toString().padStart(2, "0")} s` : `${s} s`;
}

export const STATUS_LABEL: Record<string, string> = {
  ready: "Not started",
  in_progress: "In progress",
  completed: "Completed",
  abandoned: "Ended early",
};
