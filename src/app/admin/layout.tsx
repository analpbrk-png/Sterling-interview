"use client";
import { AppShell } from "@/components/app-shell";
import { RequireAdmin } from "@/components/guards";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <RequireAdmin>{(user) => <AppShell user={user}>{children}</AppShell>}</RequireAdmin>;
}
