import { BrandMark } from "@/components/brand-mark";
import { LinkButton } from "@/components/ui";
import { brand, DISCLAIMER } from "@/config/brand";

export default function Home() {
  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 min-h-dvh flex flex-col">
      <header className="flex items-center justify-between py-6">
        <BrandMark />
        <LinkButton href="/login/" variant="ghost">Admin sign in</LinkButton>
      </header>
      <main className="flex-1 py-16 sm:py-24">
        <p className="text-sm font-medium text-accent">UK credibility &amp; CAS Shield-style practice</p>
        <h1 className="mt-3 text-4xl sm:text-5xl font-semibold tracking-tight text-ink max-w-3xl leading-[1.1]">
          Walk into your university interview already knowing how it feels.
        </h1>
        <p className="mt-5 text-lg text-muted max-w-2xl">{brand.tagline}. One question at a time, realistic timers, questions tailored to your course and background. Nothing is recorded.</p>
        <div className="mt-10 rounded-2xl border border-line bg-surface p-5 max-w-xl">
          <p className="font-medium">Are you a student?</p>
          <p className="mt-1 text-sm text-muted">You do not need an account. Open the personal interview link your adviser sent you by WhatsApp or email.</p>
        </div>
      </main>
      <footer className="border-t border-line py-6 text-xs text-muted">{DISCLAIMER}</footer>
    </div>
  );
}
