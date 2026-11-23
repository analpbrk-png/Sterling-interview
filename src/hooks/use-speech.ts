"use client";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Browser text-to-speech for reading questions aloud. Each new utterance
 * cancels the previous one, so voices never overlap. It is fire-and-forget:
 * timers never wait for speech.
 */
export function useSpeech(initialEnabled: boolean, initialRate: number) {
  // Detected after mount so server and client render the same markup.
  const [supported, setSupported] = useState(false);
  const [enabled, setEnabled] = useState(initialEnabled);
  useEffect(() => {
    setSupported("speechSynthesis" in window);
  }, []);
  const [rate, setRate] = useState(initialRate);
  const voice = useRef<SpeechSynthesisVoice | null>(null);

  useEffect(() => {
    if (!supported) return;
    const pick = () => {
      const voices = window.speechSynthesis.getVoices();
      voice.current =
        voices.find((v) => v.lang === "en-GB" && /natural|google|daniel|serena|libby|sonia/i.test(v.name)) ??
        voices.find((v) => v.lang === "en-GB") ??
        voices.find((v) => v.lang.startsWith("en")) ??
        null;
    };
    pick();
    window.speechSynthesis.addEventListener?.("voiceschanged", pick);
    return () => {
      window.speechSynthesis.removeEventListener?.("voiceschanged", pick);
      window.speechSynthesis.cancel();
    };
  }, [supported]);

  const cancel = useCallback(() => {
    if (supported) window.speechSynthesis.cancel();
  }, [supported]);

  const speak = useCallback(
    (text: string) => {
      if (!supported || !enabled) return;
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text.trim().replace(/\s*\?$/, "?"));
      u.lang = voice.current?.lang ?? "en-GB";
      if (voice.current) u.voice = voice.current;
      u.rate = rate;
      u.pitch = 1;
      window.speechSynthesis.speak(u);
    },
    [enabled, rate, supported],
  );

  useEffect(() => {
    if (!enabled) cancel();
  }, [enabled, cancel]);

  return { supported, enabled: enabled && supported, setEnabled, rate, setRate, speak, cancel };
}

/** Short, quiet tone marking the start of answer time. */
export function playCue(ctxRef: { current: AudioContext | null }) {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    ctxRef.current ??= new Ctx();
    const ctx = ctxRef.current;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 784;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.08, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.25);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.27);
  } catch {
    // Audio cues are optional.
  }
}
