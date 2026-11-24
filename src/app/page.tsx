import { ArrowRight, Clock3, EyeOff, Link2, Sparkles } from "lucide-react";
import { SterlingLogo } from "@/components/brand-mark";
import { LinkButton } from "@/components/ui";
import { brand, DISCLAIMER } from "@/config/brand";

export default function Home() {
  const features = [
    { icon: Link2, title: "No student login", text: "Each student gets a private interview link from their adviser." },
    { icon: Clock3, title: "Realistic timing", text: "One question at a time, with preparation and answer timers." },
    { icon: Sparkles, title: "Tailored questions", text: "Built around the course, the university and the student's background." },
    { icon: EyeOff, title: "Nothing recorded", text: "Camera and microphone are a live preview only, never saved." },
  ];
  return (
    <div className="min-h-dvh flex flex-col bg-[#15130e] text-[#f5f1e6] relative overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(50rem_30rem_at_85%_-10%,rgba(214,173,69,0.22),transparent_60%),radial-gradient(40rem_24rem_at_-10%_110%,rgba(252,209,22,0.08),transparent_60%)]" />
      <header className="relative mx-auto w-full max-w-6xl px-5 sm:px-8 pt-[max(1.5rem,env(safe-area-inset-top))] pb-6 flex items-center justify-between gap-4">
        <SterlingLogo width={156} className="on-dark" />
        <LinkButton href="/login/" variant="ghost" size="sm" className="text-[#cfc9b8] hover:text-white hover:bg-white/10">Admin sign in</LinkButton>
      </header>
      <main className="relative flex-1 mx-auto w-full max-w-6xl px-5 sm:px-8 py-12 sm:py-20">
        <p className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-[#e8c972]"><Sparkles className="size-3.5" /> UK credibility &amp; CAS Shield-style practice</p>
        <h1 className="mt-6 text-[40px] sm:text-[64px] font-semibold tracking-tight max-w-4xl leading-[1.04]">
          Walk into your university interview <span className="text-gold-gradient">already knowing how it feels.</span>
        </h1>
        <p className="mt-6 text-lg text-[#cfc9b8] max-w-2xl">{brand.tagline}. One question at a time, realistic timers, questions tailored to your course and background.</p>
        <div className="mt-10 max-w-xl rounded-2xl border border-white/10 bg-white/[0.04] p-5 backdrop-blur">
          <p className="font-display text-lg font-semibold">Are you a student?</p>
          <p className="mt-1 text-sm text-[#cfc9b8]">You do not need an account. Open the personal interview link your adviser sent you by WhatsApp or email.</p>
        </div>
        <ul className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((f) => (
            <li key={f.title} className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
              <f.icon aria-hidden className="size-5 text-[#e8c972]" strokeWidth={1.8} />
              <p className="mt-3 font-display font-semibold">{f.title}</p>
              <p className="mt-1 text-sm text-[#a59f8d]">{f.text}</p>
            </li>
          ))}
        </ul>
        <LinkButton href="/login/" variant="primary" className="mt-12">Adviser portal <ArrowRight /></LinkButton>
      </main>
      <footer className="relative border-t border-white/10 py-6 px-5 text-center text-xs text-[#979080] pb-[max(1.5rem,env(safe-area-inset-bottom))]">{DISCLAIMER}</footer>
    </div>
  );
}
