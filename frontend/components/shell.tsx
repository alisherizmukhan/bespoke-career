"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity, Bell, Briefcase, CreditCard, FileText, Gauge, KanbanSquare, LayoutDashboard, LogOut, Menu, MessageSquare,
  ScrollText, Search, Settings, Shield, Sparkles, User as UserIcon, Users, Wallet, X, BookOpen, Rss,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { ago } from "@/lib/format";
import { Logo, Skeleton, cx } from "./ui";

const APP_NAV = [
  { group: "Overview", items: [{ href: "/app", label: "Dashboard", icon: LayoutDashboard }, { href: "/app/assistant", label: "AI Assistant", icon: Sparkles }] },
  { group: "Job search", items: [{ href: "/app/jobs", label: "Jobs", icon: Briefcase }, { href: "/app/tracker", label: "Job Tracker", icon: KanbanSquare }] },
  { group: "Career tools", items: [{ href: "/app/resumes", label: "Resumes", icon: FileText }, { href: "/app/salary", label: "Salary", icon: Wallet }] },
  { group: "Account", items: [{ href: "/app/profile", label: "Career profile", icon: UserIcon }, { href: "/app/billing", label: "Plan & billing", icon: CreditCard }, { href: "/app/settings", label: "Settings", icon: Settings }] },
];

const ADMIN_NAV = [
  { group: "Admin", items: [
    { href: "/admin", label: "Metrics", icon: Gauge }, { href: "/admin/users", label: "Users", icon: Users },
    { href: "/admin/sources", label: "Job sources", icon: Rss }, { href: "/admin/plans", label: "Plans & limits", icon: CreditCard },
    { href: "/admin/knowledge", label: "Knowledge", icon: BookOpen }, { href: "/admin/ai", label: "AI usage", icon: Activity },
    { href: "/admin/audit", label: "Audit log", icon: ScrollText },
  ] },
];

function Notifications() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["notifications"], queryFn: () => api("/notifications"), refetchInterval: 60_000 });
  const read = useMutation({ mutationFn: () => api("/notifications/read", { method: "POST" }), onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }) });
  useEffect(() => {
    const h = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  const unread = q.data?.unread || 0;
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => { setOpen(!open); if (!open && unread) read.mutate(); }} className="relative rounded-md p-2 text-ink-muted hover:bg-lavender-100" aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}>
        <Bell className="h-5 w-5" />
        {unread > 0 && <span className="absolute right-1 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-violet-600 px-1 text-[10px] font-bold text-white">{unread}</span>}
      </button>
      {open && (
        <div className="absolute right-0 top-12 z-50 w-[340px] max-w-[calc(100vw-24px)] rounded-lg border border-line bg-white p-2 shadow-pop">
          <p className="px-3 py-2 text-sm font-semibold">Notifications</p>
          <div className="max-h-[380px] overflow-y-auto">
            {q.data?.due_reminders?.map((r: any) => (
              <Link key={r.id} href="/app/tracker" onClick={() => setOpen(false)} className="block rounded-md px-3 py-2.5 hover:bg-lavender-50">
                <p className="text-sm font-medium text-warning">Reminder · {r.title}</p><p className="text-xs text-ink-muted">Due {ago(r.due_at) || "soon"}</p>
              </Link>
            ))}
            {q.data?.items?.length ? q.data.items.map((n: any) => (
              <Link key={n.id} href={n.link || "#"} onClick={() => setOpen(false)} className="block rounded-md px-3 py-2.5 hover:bg-lavender-50">
                <p className="text-sm font-medium">{n.title}</p>
                {n.body && <p className="line-clamp-2 text-xs text-ink-muted">{n.body}</p>}
                <p className="mt-0.5 text-[11px] text-ink-muted">{ago(n.created_at)}</p>
              </Link>
            )) : !q.data?.due_reminders?.length && <p className="px-3 py-6 text-center text-sm text-ink-muted">You're all caught up.</p>}
          </div>
        </div>
      )}
    </div>
  );
}

function SideNav({ nav, dark, onNavigate }: { nav: typeof APP_NAV; dark?: boolean; onNavigate?: () => void }) {
  const path = usePathname();
  return (
    <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-5" aria-label="App">
      {nav.map((g) => (
        <div key={g.group}>
          <p className={cx("mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-[0.08em]", dark ? "text-white/40" : "text-ink-muted/80")}>{g.group}</p>
          {g.items.map((it) => {
            const active = it.href === "/app" || it.href === "/admin" ? path === it.href : path.startsWith(it.href);
            return (
              <Link key={it.href} href={it.href} onClick={onNavigate}
                className={cx("mb-0.5 flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors",
                  dark ? (active ? "bg-white/10 text-white" : "text-white/70 hover:bg-white/5 hover:text-white")
                    : (active ? "bg-violet-100 text-violet-700" : "text-ink-muted hover:bg-lavender-50 hover:text-ink"))}>
                <it.icon className="h-[18px] w-[18px]" strokeWidth={1.8} />{it.label}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

export function AppShell({ children, admin }: { children: React.ReactNode; admin?: boolean }) {
  const { user, loading, signOut } = useAuth();
  const router = useRouter();
  const path = usePathname();
  const [mobile, setMobile] = useState(false);
  const [menu, setMenu] = useState(false);
  const [q, setQ] = useState("");

  useEffect(() => {
    if (loading) return;
    if (!user) router.replace(`/login?next=${encodeURIComponent(path)}`);
    else if (admin && user.role !== "admin") router.replace("/app");
    else if (!admin && !user.onboarding_completed && user.role !== "admin" && !path.startsWith("/app/onboarding")) router.replace("/app/onboarding");
  }, [user, loading, admin, path, router]);
  useEffect(() => setMobile(false), [path]);

  if (loading || !user) return <div className="grid min-h-screen place-items-center"><Skeleton className="h-10 w-40" /></div>;
  const nav = admin ? ADMIN_NAV : APP_NAV;
  const sidebar = (
    <>
      <div className={cx("flex h-[72px] items-center px-6", admin ? "border-b border-white/10" : "border-b border-line")}><Logo light={admin} /></div>
      <SideNav nav={nav} dark={admin} onNavigate={() => setMobile(false)} />
      {!admin && user.role === "admin" && <Link href="/admin" className="mx-3 mb-2 flex items-center gap-2 rounded-md px-3 py-2 text-sm text-ink-muted hover:bg-lavender-50"><Shield className="h-4 w-4" />Admin panel</Link>}
      {admin && <Link href="/app" className="mx-3 mb-2 flex items-center gap-2 rounded-md px-3 py-2 text-sm text-white/70 hover:bg-white/5"><LayoutDashboard className="h-4 w-4" />User app</Link>}
    </>
  );
  return (
    <div className="min-h-screen bg-lavender-50">
      <aside className={cx("fixed inset-y-0 left-0 z-40 hidden w-[248px] flex-col lg:flex", admin ? "bg-violet-900" : "border-r border-line bg-white")}>{sidebar}</aside>
      {mobile && (
        <div className="fixed inset-0 z-50 lg:hidden" onClick={() => setMobile(false)}>
          <div className="absolute inset-0 bg-ink/30" />
          <aside className={cx("absolute inset-y-0 left-0 flex w-[264px] flex-col", admin ? "bg-violet-900" : "bg-white")} onClick={(e) => e.stopPropagation()}>{sidebar}</aside>
        </div>
      )}
      <div className="lg:pl-[248px]">
        <header className="sticky top-0 z-30 flex h-[72px] items-center gap-3 border-b border-line bg-white/90 px-4 backdrop-blur sm:px-6">
          <button className="rounded-md p-2 lg:hidden" onClick={() => setMobile(true)} aria-label="Open menu"><Menu className="h-5 w-5" /></button>
          <form className="relative hidden max-w-md flex-1 sm:block" onSubmit={(e) => { e.preventDefault(); router.push(`/app/jobs?q=${encodeURIComponent(q)}`); }}>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search jobs, companies…" aria-label="Search jobs"
              className="h-10 w-full rounded-md border border-line bg-lavender-50 pl-9 pr-3 text-sm placeholder:text-ink-muted focus:border-violet-400 focus:bg-white focus:outline-none" />
          </form>
          <div className="ml-auto flex items-center gap-1">
            {!admin && <Link href="/app/assistant" className="hidden items-center gap-1.5 rounded-md bg-violet-100 px-3 py-2 text-[13px] font-semibold text-violet-700 hover:bg-violet-200 sm:inline-flex"><MessageSquare className="h-4 w-4" />Ask Bespoke</Link>}
            <Notifications />
            <div className="relative">
              <button onClick={() => setMenu(!menu)} className="flex items-center gap-2 rounded-md p-1.5 hover:bg-lavender-100" aria-label="Account menu">
                <span className="grid h-9 w-9 place-items-center rounded-full bg-violet-100 text-sm font-bold text-violet-700">{(user.full_name || user.email).slice(0, 1).toUpperCase()}</span>
              </button>
              {menu && (
                <div className="absolute right-0 top-12 z-50 w-56 rounded-lg border border-line bg-white p-1.5 shadow-pop" onMouseLeave={() => setMenu(false)}>
                  <p className="truncate px-3 py-2 text-sm font-semibold">{user.full_name || "Account"}<span className="block truncate text-xs font-normal text-ink-muted">{user.email}</span></p>
                  <Link href="/app/profile" className="block rounded-md px-3 py-2 text-sm hover:bg-lavender-50">Career profile</Link>
                  <Link href="/app/settings" className="block rounded-md px-3 py-2 text-sm hover:bg-lavender-50">Settings</Link>
                  <button onClick={signOut} className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-danger hover:bg-danger-soft"><LogOut className="h-4 w-4" />Log out</button>
                </div>
              )}
            </div>
          </div>
        </header>
        {!admin && !user.email_verified && (
          <div className="flex flex-wrap items-center gap-2 border-b border-warning-soft bg-warning-soft px-4 py-2 text-[13px] text-warning sm:px-6">
            Confirm your email to secure your account. <Link href="/verify-email" className="font-semibold underline">Confirm now</Link>
          </div>
        )}
        <main className="mx-auto max-w-content px-4 py-6 sm:px-6 sm:py-8">{children}</main>
      </div>
    </div>
  );
}

export { X };
