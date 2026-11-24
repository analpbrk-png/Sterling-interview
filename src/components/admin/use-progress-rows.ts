"use client";
import { Activity, CheckCircle2, Hourglass, PauseCircle, TimerOff } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { must, useLoad } from "@/lib/use-load";
import { useLiveChanges, type ProgressRow } from "@/lib/admin/progress";

/** All invitation progress rows, kept live via Supabase Realtime. */
export function useProgressRows() {
  const res = useLoad(async () =>
    must(await createClient().from("admin_invitation_progress").select("*").order("created_at", { ascending: false }).limit(1000)) as ProgressRow[], []);
  useLiveChanges(() => void res.reload());
  return res;
}

export const STATUS_ICON = { not_started: Hourglass, in_progress: Activity, completed: CheckCircle2, interrupted: PauseCircle, expired: TimerOff } as const;
