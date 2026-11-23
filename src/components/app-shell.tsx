"use client";
import Link from "next/link";
import { BrandMark } from "@/components/brand-mark";
import { DISCLAIMER } from "@/config/brand";
import { useAuth, type AppUser } from "@/components/auth-provider";

export function AppShell({ user, nav, children, wide = false }: {
  user: AppUser;
  nav: Array<{ href: string; label: string }>;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="min-h-dvh flex flex-col">
      <header className="sticky top-0 z-20 border-b border-line bg-[color-mix(in_oklab,var(--bg)_88%,transparent)] backdrop-blur">
        <div className={`mx-auto ${wide ? "max-w-7xl" : "max-w-5xl"} px-4 sm:px-6 h-16 flex items-center gap-4`}>
          <BrandMark href="/admin/" compact />
          <nav className="ml-auto flex items-center gap-1 overflow-x-auto no-scrollbar" aria-label="Main">
            {nav.map((n) => (
              <Link key={n.href} href={n.href} className="rounded-lg px-3 py-2 text-sm text-ink-2 hover:bg-surface-2 hover:text-ink whitespace-nowrap">
                {n.label}
              </Link>
            ))}
            {user.role === "admin" && (
              <Link href="/admin/" className="rounded-lg px-3 py-2 text-sm text-accent hover:bg-accent-soft whitespace-nowrap">Admin</Link>
            )}
            <SignOut />
          </nav>
        </div>
      </header>
      <main className={`mx-auto w-full ${wide ? "max-w-7xl" : "max-w-5xl"} flex-1 px-4 sm:px-6 py-8 sm:py-10`}>{children}</main>
      <footer className="border-t border-line py-5 text-center text-xs text-muted px-4">{DISCLAIMER}</footer>
    </div>
  );
}

function SignOut() {
  const { signOut } = useAuth();
  return (
    <button type="button" onClick={() => void signOut()} className="rounded-lg px-3 py-2 text-sm text-muted hover:bg-surface-2 whitespace-nowrap">Sign out</button>
  );
}
