"use client";
import { AppShell } from "@/components/app-shell";
import { RequireUser } from "@/components/guards";

const NAV = [
  { href: "/dashboard/", label: "Dashboard" },
  { href: "/profile/", label: "Profile" },
  { href: "/applications/", label: "Applications" },
  { href: "/history/", label: "History" },
];

export default function StudentLayout({ children }: { children: React.ReactNode }) {
  return <RequireUser>{(user) => <AppShell user={user} nav={NAV}>{children}</AppShell>}</RequireUser>;
}
