"use client";
import { useCallback, useEffect, useRef, useState } from "react";

export type MediaStatus = "idle" | "requesting" | "ready" | "denied" | "unavailable" | "unsupported";

/**
 * Live camera/microphone for on-screen preview only. Nothing here records:
 * no MediaRecorder, no canvas capture, no uploads. Tracks are stopped on
 * stop(), on unmount and when the page is hidden for good (pagehide).
 */
export function useMediaStream() {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [status, setStatus] = useState<MediaStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<MediaStream | null>(null);

  const stop = useCallback(() => {
    ref.current?.getTracks().forEach((t) => t.stop());
    ref.current = null;
    setStream(null);
    setStatus((s) => (s === "ready" ? "idle" : s));
  }, []);

  const request = useCallback(async (opts: { video: boolean } = { video: true }) => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setStatus("unsupported");
      setError("This browser cannot access a camera or microphone. Try the latest Chrome, Safari, Edge or Firefox.");
      return null;
    }
    setStatus("requesting");
    setError(null);
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
        video: opts.video ? { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } } : false,
      });
      ref.current?.getTracks().forEach((t) => t.stop());
      ref.current = s;
      setStream(s);
      setStatus("ready");
      return s;
    } catch (e) {
      const name = e instanceof DOMException ? e.name : "";
      if (name === "NotAllowedError" || name === "SecurityError") {
        setStatus("denied");
        setError("Permission was blocked. Allow camera and microphone in your browser's site settings, then try again.");
      } else if (name === "NotFoundError" || name === "OverconstrainedError") {
        setStatus("unavailable");
        setError("No camera or microphone was found. Connect one, or continue without it.");
      } else if (name === "NotReadableError") {
        setStatus("unavailable");
        setError("Your camera or microphone is being used by another app. Close it and try again.");
      } else {
        setStatus("unavailable");
        setError("Could not start your camera or microphone.");
      }
      return null;
    }
  }, []);

  useEffect(() => {
    const onHide = () => ref.current?.getTracks().forEach((t) => t.stop());
    window.addEventListener("pagehide", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      ref.current?.getTracks().forEach((t) => t.stop());
      ref.current = null;
    };
  }, []);

  return { stream, status, error, request, stop };
}

/** 0..1 microphone activity level, sampled ~12 times a second. Audio is analysed in memory only. */
export function useMicLevel(stream: MediaStream | null) {
  const [level, setLevel] = useState(0);
  useEffect(() => {
    const track = stream?.getAudioTracks()[0];
    if (!stream || !track) {
      setLevel(0);
      return;
    }
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const source = ctx.createMediaStreamSource(new MediaStream([track]));
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);
    const data = new Uint8Array(analyser.fftSize);
    let raf = 0;
    let last = 0;
    const loop = (t: number) => {
      raf = requestAnimationFrame(loop);
      if (t - last < 80) return;
      last = t;
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (const v of data) sum += ((v - 128) / 128) ** 2;
      setLevel(Math.min(1, Math.sqrt(sum / data.length) * 4));
    };
    raf = requestAnimationFrame(loop);
    void ctx.resume().catch(() => {});
    return () => {
      cancelAnimationFrame(raf);
      source.disconnect();
      void ctx.close().catch(() => {});
    };
  }, [stream]);
  return level;
}
