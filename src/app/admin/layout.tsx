"use client";
import { AppShell } from "@/components/app-shell";
import { RequireAdmin } from "@/components/guards";

const NAV = [
  { href: "/admin/", label: "Dashboard" },
  { href: "/admin/invitations/new/", label: "New interview" },
  { href: "/admin/questions/", label: "Questions" },
  { href: "/admin/universities/", label: "Universities" },
  { href: "/admin/templates/", label: "Templates" },
  { href: "/admin/settings/", label: "Settings" },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <RequireAdmin>{(user) => <AppShell user={{ ...user, role: "student" }} nav={NAV} wide>{children}</AppShell>}</RequireAdmin>;
}
