import { BrandMark } from "@/components/brand-mark";
import { DISCLAIMER } from "@/config/brand";
import { ConfigGate } from "@/components/config-gate";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh flex flex-col px-4">
      <header className="py-6 mx-auto w-full max-w-md"><BrandMark /></header>
      <main className="flex-1 grid place-items-start sm:place-items-center">
        <div className="w-full max-w-md mx-auto pb-16">
          <ConfigGate>{children}</ConfigGate>
        </div>
      </main>
      <footer className="py-6 text-center text-xs text-muted">{DISCLAIMER}</footer>
    </div>
  );
}
