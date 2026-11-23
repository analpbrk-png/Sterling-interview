"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";
import { Button, Field, Input, Notice } from "@/components/ui";

export function AuthForm({ mode, next }: { mode: "login" | "signup"; next: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");
    const supabase = createClient();
    try {
      if (mode === "signup") {
        if (password.length < 8) throw new Error("Use at least 8 characters for your password.");
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=/profile` },
        });
        if (error) throw error;
        if (!data.session) {
          setInfo("Check your inbox to confirm your email, then sign in.");
          return;
        }
        router.replace("/profile");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.replace(next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {error && <Notice tone="danger">{error}</Notice>}
      {info && <Notice tone="ok">{info}</Notice>}
      <Field label="Email">
        <Input name="email" type="email" autoComplete="email" required />
      </Field>
      <Field label="Password" hint={mode === "signup" ? "At least 8 characters." : undefined}>
        <Input name="password" type="password" autoComplete={mode === "signup" ? "new-password" : "current-password"} required minLength={mode === "signup" ? 8 : undefined} />
      </Field>
      <Button type="submit" disabled={busy} className="w-full">
        {busy ? "Please wait…" : mode === "signup" ? "Create account" : "Sign in"}
      </Button>
    </form>
  );
}
