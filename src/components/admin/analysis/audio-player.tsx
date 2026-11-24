"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Pause, Play, RotateCcw } from "lucide-react";
import { cx, Spinner } from "@/components/ui";

export interface LoadedAudio {
  blob: Blob;
  url: string;          // object URL of the downloaded file (revoked on unmount)
  peaks: number[] | null; // real waveform from the decoded file, null if this browser cannot decode it
  durationMs: number | null;
}

const fmt = (s: number) => (Number.isFinite(s) ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}` : "0:00");
const SPEEDS = [0.75, 1, 1.25, 1.5, 2];

/** Peaks (0..1) per bucket from decoded PCM, for a static waveform. */
export function peaksFrom(pcm: Float32Array, buckets = 120): number[] {
  const size = Math.max(1, Math.floor(pcm.length / buckets));
  const out: number[] = [];
  for (let b = 0; b < buckets; b++) {
    let max = 0;
    for (let i = b * size; i < Math.min(pcm.length, (b + 1) * size); i++) max = Math.max(max, Math.abs(pcm[i]));
    out.push(max);
  }
  const top = Math.max(0.0001, ...out);
  return out.map((v) => v / top);
}

/**
 * Plays a stored answer. Nothing here is simulated: the waveform comes from the
 * decoded file and the player plays the file itself.
 */
export function AudioPlayer({ load, label }: { load: () => Promise<LoadedAudio>; label: string }) {
  const [audio, setAudio] = useState<LoadedAudio | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [t, setT] = useState(0);
  const [dur, setDur] = useState(0);
  const [speed, setSpeed] = useState(1);
  const el = useRef<HTMLAudioElement>(null);

  const fetchAudio = useCallback(async () => {
    setState("loading");
    setError(null);
    try {
      const a = await load();
      setAudio(a);
      setDur((a.durationMs ?? 0) / 1000);
      setState("ready");
      return a;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the recording.");
      setState("error");
      return null;
    }
  }, [load]);

  useEffect(() => () => { if (audio) URL.revokeObjectURL(audio.url); }, [audio]);
  useEffect(() => { if (el.current) el.current.playbackRate = speed; }, [speed, audio]);

  async function toggle() {
    if (!audio) { const a = await fetchAudio(); if (!a) return; await new Promise((r) => setTimeout(r, 50)); }
    const a = el.current;
    if (!a) return;
    if (a.paused) { try { await a.play(); } catch { setError("This browser cannot play this audio format."); } } else a.pause();
  }

  const seek = (frac: number) => {
    const a = el.current;
    // Browser-recorded WebM often reports duration = Infinity; use the decoded length instead.
    const total = Number.isFinite(a?.duration) && a!.duration > 0 ? a!.duration : dur;
    if (!a || !(total > 0)) return;
    a.currentTime = Math.max(0, Math.min(1, frac)) * total;
    setT(a.currentTime);
  };
  const pct = dur > 0 ? Math.min(1, t / dur) : 0;

  return (
    <div className="rounded-2xl border border-line bg-surface-2/50 p-3 sm:p-4">
      {audio && (
        <audio
          ref={el} src={audio.url} preload="metadata" aria-label={label}
          onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)}
          onTimeUpdate={(e) => setT(e.currentTarget.currentTime)}
          onLoadedMetadata={(e) => { if (Number.isFinite(e.currentTarget.duration)) setDur(e.currentTarget.duration); }}
          onError={() => setError("This browser cannot play this audio format. Try Chrome, Edge or Safari 17+.")}
        />
      )}
      <div className="flex items-center gap-3">
        <button
          type="button" onClick={() => void toggle()} disabled={state === "loading"} aria-label={playing ? "Pause" : `Play ${label}`}
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-gold-gradient text-[#17150f] shadow-[var(--shadow-accent)] disabled:opacity-60"
        >
          {state === "loading" ? <Spinner /> : playing ? <Pause className="size-5" /> : <Play className="size-5 translate-x-px" />}
        </button>
        <div className="min-w-0 flex-1">
          {audio?.peaks ? (
            <button type="button" aria-label="Seek" className="flex h-10 w-full items-center gap-[2px]"
              onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); seek((e.clientX - r.left) / r.width); }}>
              {audio.peaks.map((p, i) => (
                <span key={i} className={cx("flex-1 rounded-full transition-colors", i / audio.peaks!.length <= pct ? "bg-accent" : "bg-line-strong")} style={{ height: `${Math.max(8, p * 100)}%` }} />
              ))}
            </button>
          ) : (
            <input type="range" min={0} max={1000} value={Math.round(pct * 1000)} onChange={(e) => seek(Number(e.target.value) / 1000)} disabled={!audio} aria-label="Playback position" className="w-full accent-[var(--accent)]" />
          )}
          <div className="mt-1 flex items-center justify-between text-xs text-muted tabular-nums">
            <span>{fmt(t)} / {fmt(dur)}</span>
            <label className="inline-flex items-center gap-1">
              <span className="sr-only">Playback speed</span>
              <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))} className="rounded-md border border-line bg-surface px-1.5 py-0.5 text-xs">
                {SPEEDS.map((s) => <option key={s} value={s}>{s}×</option>)}
              </select>
            </label>
          </div>
        </div>
      </div>
      {state === "idle" && <p className="mt-2 text-xs text-muted">Press play to load the recording (secure, short-lived link).</p>}
      {error && <p role="alert" className="mt-2 flex items-center gap-2 text-xs text-danger">{error} <button type="button" className="inline-flex items-center gap-1 font-medium underline" onClick={() => void fetchAudio()}><RotateCcw className="size-3" />Retry</button></p>}
    </div>
  );
}
