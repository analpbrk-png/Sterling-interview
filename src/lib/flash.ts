"use client";
import { useEffect, useState } from "react";

export type Flash = { tone: "ok" | "danger" | "warn"; text: string };
const KEY = "flash";

/** Message shown on the next page after a navigation (e.g. "Profile saved"). */
export function setFlash(f: Flash) {
  try { sessionStorage.setItem(KEY, JSON.stringify(f)); } catch { /* optional */ }
}

export function useFlash() {
  const [flash, setLocal] = useState<Flash | null>(null);
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(KEY);
      if (raw) { setLocal(JSON.parse(raw)); sessionStorage.removeItem(KEY); }
    } catch { /* optional */ }
  }, []);
  return [flash, setLocal] as const;
}
