"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  BookOpenCheck, Building2, GraduationCap, LayoutDashboard, LayoutTemplate,
  ListChecks, LogOut, Menu, PanelLeftClose, PanelLeftOpen, PlusCircle, Settings2, Sparkles, X, type LucideIcon,
} from "lucide-react";
import { SterlingLogo } from "@/components/brand-mark";
import { ThemeToggle } from "@/components/theme-toggle";
import { useAuth, type AppUser } from "@/components/auth-provider";
import { cx } from "@/components/ui";
import { brand } from "@/config/brand";

export interface NavItem { href: string; label: string; icon: LucideIcon; match?: string[]; exact?: boolean }

export const ADMIN_NAV: Array<{ group: string; items: NavItem[] }> = [
  { group: "Interviews", items: [
    { href: "/admin/", label: "Dashboard", icon: LayoutDashboard, exact: true },
    { href: "/admin/invitations/new/", label: "New Interview", icon: PlusCircle },
    { href: "/admin/interviews/", label: "Interviews", icon: ListChecks, match: ["/admin/invitations/view"] },
  ] },
  { group: "Content", items: [
    { href: "/admin/questions/", label: "Question Bank", icon: BookOpenCheck },
    { href: "/admin/universities/", label: "Universities", icon: Building2 },
    { href: "/admin/courses/", label: "Courses", icon: GraduationCap },
    { href: "/admin/templates/", label: "Interview Templates", icon: LayoutTemplate },
  ] },
  { group: "Configuration", items: [
    { href: "/admin/ai/", label: "AI Settings", icon: Sparkles },
    { href: "/admin/settings/", label: "General Settings", icon: Settings2 },
  ] },
];

function isActive(path: string, item: NavItem) {
  const p = path.endsWith("/") ? path : `${path}/`;
  if (item.exact) return p === item.href;
  return p.startsWith(item.href) || !!item.match?.some((m) => p.startsWith(m));
}

const SIDEBAR_KEY = "sidebar";

function readCollapsed() {
  return typeof document !== "undefined" && document.documentElement.dataset.sidebar === "collapsed";
}

export function AppShell({ user, children }: { user: AppUser; children: React.ReactNode }) {
  const path = usePathname() ?? "/";
  // The attribute is set before first paint by the inline script in app/layout.tsx;
  // CSS (globals.css, .admin-aside) does the layout, React only mirrors it.
  const [collapsed, setCollapsed] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => { setCollapsed(readCollapsed()); }, []);
  useEffect(() => setOpen(false), [path]);
  const toggle = useCallback(() => {
    const next = !readCollapsed();
    document.documentElement.dataset.sidebar = next ? "collapsed" : "expanded";
    try { localStorage.setItem(SIDEBAR_KEY, next ? "collapsed" : "expanded"); } catch { /* storage blocked */ }
    setCollapsed(next);
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "b") { e.preventDefault(); toggle(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle]);
  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  return (
    <div className="min-h-dvh md:flex">
      {/* Tablet / desktop sidebar: width comes from html[data-sidebar] */}
      <aside id="admin-sidebar" className="admin-aside hidden md:flex sticky top-0 h-dvh shrink-0 flex-col bg-sidebar text-sidebar-ink">
        <Sidebar path={path} collapsed={collapsed} user={user} onToggle={toggle} />
      </aside>

      {/* Phone top bar */}
      <header className="md:hidden sticky top-0 z-30 bg-sidebar text-sidebar-ink pt-[env(safe-area-inset-top)]">
        <div className="flex h-14 items-center gap-3 px-4">
          <button type="button" onClick={() => setOpen(true)} aria-label="Open navigation" aria-expanded={open} aria-controls="admin-drawer" className="-ml-2 grid h-10 w-10 place-items-center rounded-xl hover:bg-white/10"><Menu className="size-5" /></button>
          <Link href="/admin/" aria-label="Dashboard"><SterlingLogo width={104} className="on-dark" /></Link>
        </div>
        <div className="brand-rule opacity-80" />
      </header>

      {/* Phone drawer */}
      <div className={cx("md:hidden fixed inset-0 z-40", !open && "pointer-events-none")} aria-hidden={!open}>
        <div onClick={() => setOpen(false)} className={cx("absolute inset-0 bg-black/55 backdrop-blur-[2px] transition-opacity duration-300", open ? "opacity-100" : "opacity-0")} />
        <aside
          id="admin-drawer" role="dialog" aria-modal="true" aria-label="Navigation"
          className={cx("absolute inset-y-0 left-0 w-[min(300px,86vw)] flex flex-col bg-sidebar text-sidebar-ink shadow-2xl transition-transform duration-300 ease-out pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]", open ? "translate-x-0" : "-translate-x-full")}
        >
          {open && <Sidebar path={path} collapsed={false} user={user} onClose={() => setOpen(false)} />}
        </aside>
      </div>

      <div className="flex-1 min-w-0 flex flex-col">
        <main className="flex-1 w-full max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-10 py-6 sm:py-8 lg:py-10 pb-[max(2rem,env(safe-area-inset-bottom))]">{children}</main>
      </div>
    </div>
  );
}

function Sidebar({ path, collapsed, user, onToggle, onClose }: { path: string; collapsed: boolean; user: AppUser; onToggle?: () => void; onClose?: () => void }) {
  const { signOut } = useAuth();
  const initials = (user.email ?? "A").slice(0, 1).toUpperCase();
  return (
    <>
      <div className="sb-head flex items-center gap-2 h-[76px] shrink-0 px-4">
        <Link href="/admin/" aria-label={`${brand.name} dashboard`} className="sb-logo block overflow-hidden min-w-0">
          <SterlingLogo width={160} className="on-dark" />
        </Link>
        {onToggle && (
          <button
            type="button" onClick={onToggle} aria-controls="admin-sidebar" aria-expanded={!collapsed}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} title={`${collapsed ? "Expand" : "Collapse"} sidebar (Ctrl/⌘ B)`}
            className="sb-toggle ml-auto grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/[0.04] text-sidebar-muted hover:bg-white/10 hover:text-sidebar-ink focus-visible:ring-2 focus-visible:ring-[#e8c972]"
          >
            {collapsed ? <PanelLeftOpen className="size-[18px]" /> : <PanelLeftClose className="size-[18px]" />}
          </button>
        )}
        {onClose && (
          <button type="button" onClick={onClose} aria-label="Close navigation" className="ml-auto grid h-9 w-9 shrink-0 place-items-center rounded-xl text-sidebar-muted hover:bg-white/10 hover:text-sidebar-ink"><X className="size-5" /></button>
        )}
      </div>
      <div className="brand-rule mx-4 opacity-60" />
      <nav aria-label="Admin" className="flex-1 overflow-y-auto overflow-x-hidden no-scrollbar px-3 py-5 grid content-start gap-6">
        {ADMIN_NAV.map((g) => (
          <div key={g.group} className="grid gap-1">
            <p className="sb-label px-3 pb-1 text-[10.5px] font-semibold uppercase tracking-[0.16em] text-sidebar-muted/80 whitespace-nowrap">{g.group}</p>
            {g.items.map((item) => {
              const active = isActive(path, item);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href} href={item.href} aria-current={active ? "page" : undefined} title={item.label} aria-label={item.label}
                  className={cx(
                    "sb-item group relative flex items-center gap-3 rounded-xl h-10 px-3 text-[13.5px] font-medium transition-colors",
                    active ? "bg-white/[0.08] text-sidebar-ink" : "text-sidebar-muted hover:bg-white/[0.05] hover:text-sidebar-ink",
                  )}
                >
                  <span aria-hidden className={cx("absolute left-0 top-2 bottom-2 w-[3px] rounded-r-full bg-gold-gradient transition-opacity", active ? "opacity-100" : "opacity-0")} />
                  <Icon aria-hidden strokeWidth={1.8} className={cx("size-[18px] shrink-0", active && "text-[#e8c972]")} />
                  <span className="sb-label truncate">{item.label}</span>
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
      <div className="shrink-0 border-t border-white/[0.08] p-3 grid gap-3">
        <ThemeToggle tone="sidebar" className="sb-label w-fit" />
        <div className="sb-user flex items-center gap-3">
          <span aria-hidden className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gold-gradient text-[13px] font-semibold text-[#17150f]">{initials}</span>
          <div className="sb-label min-w-0 flex-1">
            <p className="truncate text-[13px] font-medium">{user.email}</p>
            <p className="text-[11px] text-sidebar-muted">Administrator</p>
          </div>
          <button type="button" onClick={() => void signOut()} title="Sign out" aria-label="Sign out" className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-sidebar-muted hover:bg-white/[0.08] hover:text-sidebar-ink"><LogOut className="size-4" /></button>
        </div>
      </div>
    </>
  );
}
