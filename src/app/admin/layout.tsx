import { AppShell } from "@/components/app-shell";
import { ConfigGate } from "@/components/config-gate";
import { isSupabaseConfigured } from "@/lib/env";
import { requireAdmin } from "@/lib/auth";

const NAV = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/questions", label: "Questions" },
  { href: "/admin/universities", label: "Universities" },
  { href: "/admin/templates", label: "Templates" },
  { href: "/admin/sessions", label: "Sessions" },
  { href: "/admin/students", label: "Students" },
  { href: "/admin/settings", label: "Settings" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  if (!isSupabaseConfigured()) return <div className="max-w-md mx-auto p-6"><ConfigGate>{null}</ConfigGate></div>;
  const user = await requireAdmin();
  return <AppShell user={{ ...user, role: "student" }} nav={[...NAV, { href: "/dashboard", label: "Student view" }]} wide>{children}</AppShell>;
}
