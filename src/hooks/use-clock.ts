"use client";
import { useEffect, useState } from "react";

/**
 * One interval for the whole interview. Re-reads the clock when the tab
 * becomes visible again so stages that ended in the background resolve at once.
 */
export function useClock(active: boolean, intervalMs = 250) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const tick = () => setNow(Date.now());
    const id = window.setInterval(tick, intervalMs);
    const onVis = () => document.visibilityState === "visible" && tick();
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", tick);
    tick();
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", tick);
    };
  }, [active, intervalMs]);
  return now;
}
