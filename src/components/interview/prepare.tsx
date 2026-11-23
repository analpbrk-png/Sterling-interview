"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button, Card, Notice } from "@/components/ui";
import { callFunction } from "@/lib/functions";

const RECOVERY: Record<string, { title: string; action?: { href: string; label: string } }> = {
  profile_missing: { title: "Your profile is incomplete", action: { href: "/profile/", label: "Complete profile" } },
  empty_question_bank: { title: "No questions available yet" },
  no_template: { title: "Interview settings are missing" },
  application_not_found: { title: "Application not found", action: { href: "/applications/", label: "Your applications" } },
  unauthorised: { title: "Please sign in again", action: { href: "/login/", label: "Sign in" } },
};

export function PrepareInterview({ applicationId, universityName, courseName }: { applicationId: string; universityName: string; courseName: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);
  const once = useRef(false);

  async function go() {
    if (once.current) return; // no duplicate sessions from double clicks
    once.current = true;
    setPending(true);
    setError(null);
    const res = await callFunction<{ sessionId: string }>("create-session", { applicationId });
    if (res.data?.sessionId) {
      router.replace(`/interview/run/?id=${res.data.sessionId}`);
      return;
    }
    once.current = false;
    setPending(false);
    setError({ code: res.code ?? "unknown", message: res.error ?? "Something went wrong while preparing your interview. Please try again." });
  }

  const rec = error ? RECOVERY[error.code] : null;
  return (
    <div className="min-h-dvh grid place-items-center px-4 py-12">
      <Card className="w-full max-w-lg p-6 sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">New practice interview</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">{courseName}</h1>
        <p className="text-muted">{universityName}</p>
        <p className="mt-5 text-sm text-ink-2">
          We will prepare your full set of questions before the timer starts, so nothing interrupts you once you begin. This can take up to 30 seconds.
        </p>
        {error && (
          <div className="mt-5 grid gap-3">
            <Notice tone="danger" title={rec?.title ?? "Could not prepare the interview"}>{error.message}</Notice>
            {rec?.action && <Link href={rec.action.href} className="text-sm font-medium text-accent">{rec.action.label} →</Link>}
          </div>
        )}
        <div className="mt-7 flex flex-col sm:flex-row gap-3">
          <Button onClick={go} disabled={pending} aria-busy={pending}>{pending ? "Preparing your questions…" : error ? "Try again" : "Prepare my interview"}</Button>
          <Link href="/dashboard/" className="inline-flex h-11 items-center justify-center px-4 text-sm text-muted hover:text-ink">Cancel</Link>
        </div>
      </Card>
    </div>
  );
}
