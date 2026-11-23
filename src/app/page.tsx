export const dynamic = "force-dynamic";

import { BrandMark } from "@/components/brand-mark";
import { LinkButton } from "@/components/ui";
import { brand, DISCLAIMER } from "@/config/brand";
import { getCurrentUser } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/env";

export default async function Home() {
  const user = isSupabaseConfigured() ? await getCurrentUser() : null;
  const steps = [
    ["Build your profile", "Add your education and upload your CV. You review what we extract before it is used."],
    ["Add your applications", "Each university and course you are applying to gets its own practice sessions."],
    ["Practise, timed", "One question at a time, with realistic preparation and answer timers. Nothing is recorded."],
  ];
  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6">
      <header className="flex items-center justify-between py-6">
        <BrandMark />
        <nav className="flex gap-2">
          {user ? (
            <LinkButton href="/dashboard">Open dashboard</LinkButton>
          ) : (
            <>
              <LinkButton href="/login" variant="ghost">Sign in</LinkButton>
              <LinkButton href="/signup">Create account</LinkButton>
            </>
          )}
        </nav>
      </header>
      <main className="py-16 sm:py-24">
        <p className="text-sm font-medium text-accent">UK credibility &amp; CAS Shield-style practice</p>
        <h1 className="mt-3 text-4xl sm:text-5xl font-semibold tracking-tight text-ink max-w-3xl leading-[1.1]">
          Walk into your university interview already knowing how it feels.
        </h1>
        <p className="mt-5 text-lg text-muted max-w-2xl">{brand.tagline}. Questions are tailored to your course and background.</p>
        <div className="mt-8 flex flex-wrap gap-3">
          <LinkButton href={user ? "/dashboard" : "/signup"}>{user ? "Continue practising" : "Start practising"}</LinkButton>
          {!user && <LinkButton href="/login" variant="secondary">I have an account</LinkButton>}
        </div>
        <ol className="mt-20 grid gap-4 sm:grid-cols-3">
          {steps.map(([t, d], i) => (
            <li key={t} className="rounded-2xl border border-line bg-surface p-5">
              <span className="text-xs font-semibold text-accent">Step {i + 1}</span>
              <p className="mt-2 font-medium text-ink">{t}</p>
              <p className="mt-1 text-sm text-muted">{d}</p>
            </li>
          ))}
        </ol>
      </main>
      <footer className="border-t border-line py-6 text-xs text-muted">{DISCLAIMER}</footer>
    </div>
  );
}
