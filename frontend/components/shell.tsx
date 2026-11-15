"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, Bell, BookOpen, Briefcase, CheckCircle2, CreditCard, Download, FileText, Gauge, KanbanSquare, LayoutDashboard, LogOut, Menu, MessageSquare, Rss, ScrollText, Search, Settings, Shield, Sparkles, User as UserIcon, UserCheck, Users, Wallet, X } from "@/components/icons";
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
  { group: "Customers", items: [
    { href: "/admin/crm", label: "CRM", icon: UserCheck }, { href: "/admin/tasks", label: "Tasks", icon: CheckCircle2 },
    { href: "/admin/users", label: "Users", icon: Users },
  ] },
  { group: "Content", items: [
    { href: "/admin/content", label: "Site content", icon: FileText }, { href: "/admin/jobs", label: "Jobs", icon: Briefcase },
    { href: "/admin/plans", label: "Plans & limits", icon: CreditCard }, { href: "/admin/knowledge", label: "Knowledge", icon: BookOpen },
    { href: "/admin/sources", label: "Job sources", icon: Rss },
  ] },
  { group: "System", items: [
    { href: "/admin", label: "Metrics", icon: Gauge }, { href: "/admin/ai", label: "AI usage", icon: Activity },
    { href: "/admin/audit", label: "Audit log", icon: ScrollText }, { href: "/admin/exports", label: "Exports", icon: Download },
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
        {unread > 0 && <span className="tabular absolute right-0.5 top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-accent px-1 font-mono text-xs text-white">{unread}</span>}
      </button>
      {open && (
        <div className="absolute right-0 top-12 z-50 w-[340px] max-w-[calc(100vw-24px)] rounded-lg border border-line bg-white p-2 shadow-pop">
          <p className="px-3 py-2 text-sm font-medium">Notifications</p>
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
                <p className="mt-0.5 text-xs text-ink-muted">{ago(n.created_at)}</p>
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
    <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-4" aria-label="App">
      {nav.map((g) => (
        <div key={g.group}>
          <p className={cx("mb-2 px-3 text-xs", dark ? "text-night-mute" : "text-ink-faint")}>{g.group}</p>
          {g.items.map((it) => {
            const active = it.href === "/app" || it.href === "/admin" ? path === it.href : path.startsWith(it.href);
            return (
              <Link key={it.href} href={it.href} onClick={onNavigate}
                className={cx("mb-0.5 flex h-9 items-center gap-2.5 rounded-md px-3 text-sm transition-colors duration-150",
                  dark ? (active ? "bg-night-700 text-night-text shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]" : "text-night-soft hover:bg-night-800 hover:text-night-text")
                    : (active ? "bg-lavender-100 font-medium text-ink" : "text-ink-muted hover:bg-lavender-50 hover:text-ink"))}>
                <it.icon className={cx("h-[18px] w-[18px] shrink-0", active ? "" : "opacity-80")} />{it.label}
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
      <div className={cx("flex h-16 items-center px-6", admin ? "border-b border-night-line" : "border-b border-line")}><Logo light={admin} /></div>
      <SideNav nav={nav} dark={admin} onNavigate={() => setMobile(false)} />
      {!admin && user.role === "admin" && <Link href="/admin" className="mx-3 mb-2 flex items-center gap-2 rounded-md px-3 py-2 text-sm text-ink-muted hover:bg-lavender-50"><Shield className="h-4 w-4" />Admin panel</Link>}
      {admin && <Link href="/app" className="mx-3 mb-2 flex items-center gap-2 rounded-md px-3 py-2 text-sm text-night-soft hover:bg-night-800"><LayoutDashboard className="h-4 w-4" />User app</Link>}
    </>
  );
  return (
    <div className="min-h-screen bg-lavender-50">
      <aside className={cx("fixed inset-y-0 left-0 z-40 hidden w-[248px] flex-col lg:flex", admin ? "bg-night-900" : "border-r border-line bg-white")}>{sidebar}</aside>
      {mobile && (
        <div className="fixed inset-0 z-50 lg:hidden" onClick={() => setMobile(false)}>
          <div className="absolute inset-0 bg-ink/30" />
          <aside className={cx("absolute inset-y-0 left-0 flex w-[264px] flex-col", admin ? "bg-night-900" : "bg-white")} onClick={(e) => e.stopPropagation()}>{sidebar}</aside>
        </div>
      )}
      <div className="lg:pl-[248px]">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-line bg-lavender-50 px-4 sm:px-6">
          <button className="rounded-md p-2 lg:hidden" onClick={() => setMobile(true)} aria-label="Open menu"><Menu className="h-5 w-5" /></button>
          <form className="relative hidden max-w-md flex-1 sm:block" onSubmit={(e) => { e.preventDefault(); router.push(admin ? `/admin/crm?q=${encodeURIComponent(q)}` : `/app/jobs?q=${encodeURIComponent(q)}`); }}>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={admin ? "Search customers" : "Search jobs"} aria-label={admin ? "Search customers" : "Search jobs"}
              className="h-9 w-full rounded-md border border-line bg-white pl-9 pr-3 text-sm placeholder:text-ink-faint focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25" />
          </form>
          <div className="ml-auto flex items-center gap-1">
            {!admin && <Link href="/app/assistant" className="hidden h-8 items-center gap-1.5 rounded-md border border-line bg-white px-3 text-small text-ink transition-colors duration-150 hover:bg-lavender-100 sm:inline-flex"><MessageSquare className="h-4 w-4 text-ink-faint" />Ask the assistant</Link>}
            <Notifications />
            <div className="relative">
              <button onClick={() => setMenu(!menu)} className="flex items-center gap-2 rounded-md p-1.5 hover:bg-lavender-100" aria-label="Account menu">
                <span className="grid h-8 w-8 place-items-center rounded-full bg-ink text-small font-medium text-lavender-50">{(user.full_name || user.email).slice(0, 1).toUpperCase()}</span>
              </button>
              {menu && (
                <div className="absolute right-0 top-12 z-50 w-56 rounded-lg border border-line bg-white p-1.5 shadow-pop" onMouseLeave={() => setMenu(false)}>
                  <p className="truncate px-3 py-2 text-sm font-medium">{user.full_name || "Account"}<span className="block truncate text-xs font-normal text-ink-muted">{user.email}</span></p>
                  <Link href="/app/profile" className="block rounded-md px-3 py-2 text-sm hover:bg-lavender-50">Career profile</Link>
                  <Link href="/app/settings" className="block rounded-md px-3 py-2 text-sm hover:bg-lavender-50">Settings</Link>
                  <button onClick={signOut} className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-danger hover:bg-danger-soft"><LogOut className="h-4 w-4" />Log out</button>
                </div>
              )}
            </div>
          </div>
        </header>
        {!admin && !user.email_verified && (
          <div className="flex flex-wrap items-center gap-2 border-b border-warning-soft bg-warning-soft px-4 py-2 text-small text-warning sm:px-6">
            Confirm your email to secure your account. <Link href="/verify-email" className="font-medium underline">Confirm now</Link>
          </div>
        )}
        <main className="mx-auto max-w-content px-4 py-6 sm:px-6 sm:py-8">{children}</main>
      </div>
    </div>
  );
}

export { X };
