"use client";
import { useCallback, useEffect, useRef, useState } from "react";

/** Loads data on mount (and when deps change) with loading/error state and a reload(). */
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const seq = useRef(0);
  const reload = useCallback(async () => {
    const id = ++seq.current;
    setLoading(true);
    try {
      const d = await fnRef.current();
      if (id === seq.current) { setData(d); setError(null); }
    } catch (e) {
      if (id === seq.current) setError(e instanceof Error ? e.message : "Could not load data.");
    } finally {
      if (id === seq.current) setLoading(false);
    }
  }, []);
  useEffect(() => { void reload(); }, deps); // eslint-disable-line react-hooks/exhaustive-deps
  return { data, error, loading, reload, setData };
}

/** Reads a query-string parameter after mount (static export has no server params). */
export function useParam(name: string): string | null | undefined {
  const [value, setValue] = useState<string | null | undefined>(undefined);
  useEffect(() => { setValue(new URLSearchParams(window.location.search).get(name)); }, [name]);
  return value;
}

/** Throws on Supabase errors so useLoad can show them. */
export function must<T>(res: { data: T; error: { message: string } | null }): NonNullable<T> {
  if (res.error) throw new Error(res.error.message);
  return (res.data ?? []) as NonNullable<T>;
}

/** Like must(), for maybeSingle() queries where "no row" is a valid answer. */
export function maybe<T>(res: { data: T; error: { message: string } | null }): NonNullable<T> | null {
  if (res.error) throw new Error(res.error.message);
  return (res.data ?? null) as NonNullable<T> | null;
}
