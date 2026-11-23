"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/components/auth-provider";
import { Button, Field, Input, Notice } from "@/components/ui";

/** Admin sign-in. There is no public registration. */
export function AuthForm({ next }: { mode?: "login"; next: string }) {
  const router = useRouter();
  const { refresh } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    try {
      const { error } = await createClient().auth.signInWithPassword({ email: String(form.get("email") ?? "").trim(), password: String(form.get("password") ?? "") });
      if (error) throw error;
      await refresh();
      router.replace(next.startsWith("/") && !next.startsWith("//") ? next : "/admin/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {error && <Notice tone="danger">{error}</Notice>}
      <Field label="Email"><Input name="email" type="email" autoComplete="email" required /></Field>
      <Field label="Password"><Input name="password" type="password" autoComplete="current-password" required /></Field>
      <Button type="submit" disabled={busy} className="w-full">{busy ? "Please wait…" : "Sign in"}</Button>
    </form>
  );
}
