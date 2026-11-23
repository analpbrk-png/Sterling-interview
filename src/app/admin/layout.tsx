"use client";
import { AppShell } from "@/components/app-shell";
import { RequireUser } from "@/components/guards";

const NAV = [
  { href: "/admin/", label: "Overview" },
  { href: "/admin/questions/", label: "Questions" },
  { href: "/admin/universities/", label: "Universities" },
  { href: "/admin/templates/", label: "Templates" },
  { href: "/admin/sessions/", label: "Sessions" },
  { href: "/admin/students/", label: "Students" },
  { href: "/admin/settings/", label: "Settings" },
  { href: "/dashboard/", label: "Student view" },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <RequireUser admin>{(user) => <AppShell user={{ ...user, role: "student" }} nav={NAV} wide>{children}</AppShell>}</RequireUser>;
}
