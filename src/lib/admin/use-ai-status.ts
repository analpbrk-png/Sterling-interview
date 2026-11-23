"use client";
import { useEffect, useState } from "react";
import { callFunction } from "@/lib/functions";

/** Asks the Edge Function whether an AI provider is configured (never exposes the key). */
export function useAiStatus() {
  const [status, setStatus] = useState<{ configured: boolean; provider: string | null } | null>(null);
  useEffect(() => {
    void callFunction<{ configured: boolean; provider: string | null }>("generate-questions", { action: "status" })
      .then((r) => setStatus(r.data ?? { configured: false, provider: null }));
  }, []);
  return status;
}
