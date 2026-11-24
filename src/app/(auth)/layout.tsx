import { SterlingLogo } from "@/components/brand-mark";
import { DISCLAIMER } from "@/config/brand";
import { AuthProvider } from "@/components/auth-provider";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh grid lg:grid-cols-[1fr_1.1fr]">
      <aside className="hidden lg:flex relative overflow-hidden flex-col justify-between bg-[#15130e] text-[#f5f1e6] p-12">
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(40rem_26rem_at_90%_0%,rgba(214,173,69,0.24),transparent_60%)]" />
        <SterlingLogo width={190} className="on-dark relative" />
        <div className="relative">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#e8c972]">Adviser portal</p>
          <p className="mt-3 font-display text-4xl font-semibold leading-tight max-w-md">Prepare every student for their credibility interview.</p>
          <p className="mt-4 text-[#a59f8d] max-w-md">Create private interview links, personalise questions with free AI, and follow progress live.</p>
        </div>
        <p className="relative text-xs text-[#797365]">{DISCLAIMER}</p>
      </aside>
      <div className="flex flex-col px-4 brand-backdrop pt-[env(safe-area-inset-top)]">
        <header className="py-6 mx-auto w-full max-w-md lg:hidden"><SterlingLogo width={150} /></header>
        <main className="flex-1 grid place-items-start sm:place-items-center">
          <div className="w-full max-w-md mx-auto pb-16 animate-rise"><AuthProvider>{children}</AuthProvider></div>
        </main>
        <footer className="lg:hidden py-6 text-center text-xs text-muted">{DISCLAIMER}</footer>
      </div>
    </div>
  );
}
