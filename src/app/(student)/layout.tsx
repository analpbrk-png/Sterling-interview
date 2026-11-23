import { AppShell } from "@/components/app-shell";
import { ConfigGate } from "@/components/config-gate";
import { isSupabaseConfigured } from "@/lib/env";
import { requireUser } from "@/lib/auth";

const NAV = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/profile", label: "Profile" },
  { href: "/applications", label: "Applications" },
  { href: "/history", label: "History" },
];

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  if (!isSupabaseConfigured()) return <div className="max-w-md mx-auto p-6"><ConfigGate>{null}</ConfigGate></div>;
  const user = await requireUser();
  return <AppShell user={user} nav={NAV}>{children}</AppShell>;
}
