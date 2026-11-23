"use client";
import { useCallback, useRef, useState } from "react";
import type { Flash } from "./flash";

/**
 * Runs a form action once at a time (no double submits) and turns thrown
 * errors into a message. The action returns an optional success message.
 */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<Flash | null>(null);
  const running = useRef(false);
  const run = useCallback(async (fn: () => Promise<string | void>) => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    try {
      const msg = await fn();
      if (msg) setFlash({ tone: "ok", text: msg });
    } catch (e) {
      setFlash({ tone: "danger", text: e instanceof Error ? e.message : "Something went wrong. Please try again." });
    } finally {
      running.current = false;
      setBusy(false);
    }
  }, []);
  return { run, busy, flash, setFlash };
}

/** Form helpers. */
export const fstr = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
export const fopt = (f: FormData, k: string) => fstr(f, k) || null;
export const fbool = (f: FormData, k: string) => f.get(k) === "on";
export const fint = (f: FormData, k: string) => (fstr(f, k) === "" ? null : Number.parseInt(fstr(f, k), 10));
