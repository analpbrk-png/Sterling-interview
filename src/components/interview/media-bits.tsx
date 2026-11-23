"use client";
import { useEffect, useRef } from "react";
import { cx } from "@/components/ui";

/** Live, mirrored camera preview. Display only: frames are never captured. */
export function CameraPreview({ stream, className, label = "Live camera preview (not recorded)" }: { stream: MediaStream | null; className?: string; label?: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    v.srcObject = stream && stream.getVideoTracks().length ? stream : null;
    if (v.srcObject) void v.play().catch(() => {});
  }, [stream]);
  const hasVideo = !!stream?.getVideoTracks().length;
  return (
    <div className={cx("relative overflow-hidden rounded-2xl bg-[#0b1118]", className)}>
      <video ref={ref} aria-label={label} muted playsInline autoPlay className={cx("h-full w-full object-cover -scale-x-100", !hasVideo && "hidden")} />
      {!hasVideo && <div className="absolute inset-0 grid place-items-center text-xs text-white/60 p-3 text-center">Camera off</div>}
    </div>
  );
}

export function MicMeter({ level, active, compact = false }: { level: number; active: boolean; compact?: boolean }) {
  const bars = compact ? 5 : 12;
  const speaking = active && level > 0.08;
  return (
    <div className="flex items-center gap-2.5" aria-live="polite">
      <div className="flex items-end gap-[3px] h-5" aria-hidden>
        {Array.from({ length: bars }, (_, i) => {
          const on = active && level * bars > i;
          return <span key={i} className={cx("w-[3px] rounded-full transition-[height,background] duration-100", on ? "bg-accent" : "bg-line")} style={{ height: `${30 + (i / bars) * 70}%` }} />;
        })}
      </div>
      <span className="text-xs text-muted">{!active ? "Microphone off" : speaking ? "Hearing you" : "Microphone on"}</span>
    </div>
  );
}
