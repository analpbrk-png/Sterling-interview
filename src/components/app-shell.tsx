"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  BookOpenCheck, Building2, ChevronsLeft, ChevronsRight, GraduationCap, LayoutDashboard, LayoutTemplate,
  ListChecks, LogOut, Menu, PlusCircle, Settings2, Sparkles, X, type LucideIcon,
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

export function AppShell({ user, children }: { user: AppUser; children: React.ReactNode }) {
  const path = usePathname() ?? "/";
  const [collapsed, setCollapsed] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => { try { setCollapsed(localStorage.getItem("sidebar") === "collapsed"); } catch { /* ignore */ } }, []);
  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [open]);
  const toggle = () => setCollapsed((c) => { try { localStorage.setItem("sidebar", c ? "open" : "collapsed"); } catch { /* ignore */ } return !c; });

  return (
    <div className="min-h-dvh lg:flex">
      {/* Desktop sidebar */}
      <aside
        className={cx(
          "hidden lg:flex sticky top-0 h-dvh shrink-0 flex-col bg-sidebar text-sidebar-ink transition-[width] duration-300 ease-out",
          collapsed ? "w-[76px]" : "w-[264px]",
        )}
      >
        <Sidebar path={path} collapsed={collapsed} user={user} onToggle={toggle} />
      </aside>

      {/* Mobile top bar */}
      <header className="lg:hidden sticky top-0 z-30 bg-sidebar text-sidebar-ink pt-[env(safe-area-inset-top)]">
        <div className="flex h-14 items-center gap-3 px-4">
          <button type="button" onClick={() => setOpen(true)} aria-label="Open navigation" aria-expanded={open} className="-ml-2 grid h-10 w-10 place-items-center rounded-xl hover:bg-white/8"><Menu className="size-5" /></button>
          <Link href="/admin/" aria-label="Dashboard"><SterlingLogo width={104} className="on-dark" /></Link>
        </div>
        <div className="brand-rule opacity-80" />
      </header>

      {/* Mobile drawer */}
      <div className={cx("lg:hidden fixed inset-0 z-40", open ? "" : "pointer-events-none")} aria-hidden={!open}>
        <div onClick={() => setOpen(false)} className={cx("absolute inset-0 bg-black/50 backdrop-blur-[2px] transition-opacity duration-300", open ? "opacity-100" : "opacity-0")} />
        <aside
          role="dialog" aria-modal="true" aria-label="Navigation"
          className={cx("absolute inset-y-0 left-0 w-[min(300px,86vw)] flex flex-col bg-sidebar text-sidebar-ink shadow-2xl transition-transform duration-300 ease-out pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]", open ? "translate-x-0" : "-translate-x-full")}
        >
          <button type="button" onClick={() => setOpen(false)} aria-label="Close navigation" className="absolute right-3 top-[calc(env(safe-area-inset-top)+12px)] grid h-9 w-9 place-items-center rounded-xl text-sidebar-muted hover:bg-white/8 hover:text-sidebar-ink"><X className="size-5" /></button>
          {open && <Sidebar path={path} collapsed={false} user={user} />}
        </aside>
      </div>

      <div className="flex-1 min-w-0 flex flex-col">
        <main className="flex-1 w-full max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-10 py-6 sm:py-8 lg:py-10 pb-[max(2rem,env(safe-area-inset-bottom))]">{children}</main>
      </div>
    </div>
  );
}

function Sidebar({ path, collapsed, user, onToggle }: { path: string; collapsed: boolean; user: AppUser; onToggle?: () => void }) {
  const { signOut } = useAuth();
  const initials = (user.email ?? "A").slice(0, 1).toUpperCase();
  return (
    <>
      <div className={cx("flex items-center h-[76px] shrink-0", collapsed ? "justify-center px-2" : "px-5")}>
        <Link href="/admin/" aria-label={`${brand.name} dashboard`} className="block overflow-hidden">
          {collapsed
            ? <span className="block w-[52px] overflow-hidden"><SterlingLogo width={146} className="on-dark" /></span>
            : <SterlingLogo width={172} className="on-dark" />}
        </Link>
      </div>
      <div className="brand-rule mx-5 opacity-60" style={collapsed ? { marginInline: 16 } : undefined} />
      <nav aria-label="Admin" className="flex-1 overflow-y-auto no-scrollbar px-3 py-5 grid content-start gap-6">
        {ADMIN_NAV.map((g) => (
          <div key={g.group} className="grid gap-1">
            {!collapsed && <p className="px-3 pb-1 text-[10.5px] font-semibold uppercase tracking-[0.16em] text-sidebar-muted/80">{g.group}</p>}
            {g.items.map((item) => {
              const active = isActive(path, item);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href} href={item.href} aria-current={active ? "page" : undefined} title={collapsed ? item.label : undefined}
                  className={cx(
                    "group relative flex items-center gap-3 rounded-xl h-10 text-[13.5px] font-medium transition-colors",
                    collapsed ? "justify-center px-0" : "px-3",
                    active ? "bg-white/[0.07] text-sidebar-ink" : "text-sidebar-muted hover:bg-white/[0.04] hover:text-sidebar-ink",
                  )}
                >
                  <span aria-hidden className={cx("absolute left-0 top-2 bottom-2 w-[3px] rounded-r-full bg-gold-gradient transition-opacity", active ? "opacity-100" : "opacity-0")} />
                  <Icon aria-hidden strokeWidth={1.8} className={cx("size-[18px] shrink-0", active ? "text-[#e8c972]" : "")} />
                  {!collapsed && <span className="truncate">{item.label}</span>}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
      <div className={cx("shrink-0 border-t border-white/[0.07] p-3 grid gap-3")}>
        {!collapsed && <ThemeToggle tone="sidebar" className="w-fit" />}
        <div className={cx("flex items-center gap-3", collapsed && "flex-col")}>
          <span aria-hidden className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gold-gradient text-[13px] font-semibold text-[#17150f]">{initials}</span>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-medium">{user.email}</p>
              <p className="text-[11px] text-sidebar-muted">Administrator</p>
            </div>
          )}
          <button type="button" onClick={() => void signOut()} title="Sign out" aria-label="Sign out" className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-sidebar-muted hover:bg-white/[0.06] hover:text-sidebar-ink"><LogOut className="size-4" /></button>
        </div>
        {onToggle && (
          <button type="button" onClick={onToggle} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} className={cx("flex items-center gap-2 rounded-xl h-9 text-[12.5px] text-sidebar-muted hover:bg-white/[0.04] hover:text-sidebar-ink", collapsed ? "justify-center" : "px-3")}>
            {collapsed ? <ChevronsRight className="size-4" /> : <><ChevronsLeft className="size-4" /> Collapse</>}
          </button>
        )}
      </div>
    </>
  );
}
