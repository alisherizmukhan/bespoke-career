"use client";

import { Menu, X } from "@/components/icons";
import Link from "next/link";
import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { useContent } from "@/lib/content";
import { Button, Logo, cx } from "./ui";

const NAV = [
  { href: "/jobs", label: "Jobs" },
  { href: "/#features", label: "Features" },
  { href: "/#salary", label: "Salary data" },
  { href: "/pricing", label: "Pricing" },
  { href: "/#students", label: "Students" },
];

export function PublicHeader({ dark }: { dark?: boolean }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const link = dark ? "text-night-soft hover:text-night-text" : "text-ink-muted hover:text-ink";
  const a = useContent().announcement;
  return (
    <header className={cx("z-40", dark ? "absolute inset-x-0 top-0" : "sticky top-0 border-b border-line bg-lavender-50")}>
      {a?.active && a.text && (
        <div className={cx("px-4 py-2 text-center text-[13px]", dark ? "border-b border-night-line bg-night-800 text-night-text" : "bg-ink text-white")}>
          {a.text}
          {a.link && <Link href={a.link} className="ml-2 font-medium underline underline-offset-2">{a.link_label || "Learn more"}</Link>}
        </div>
      )}
      <div className="mx-auto flex h-16 max-w-content items-center justify-between px-4 sm:px-6">
        <Logo light={dark} />
        <nav className="hidden items-center gap-8 lg:flex" aria-label="Main">
          {NAV.map((n) => <Link key={n.href} href={n.href} className={cx("text-sm transition-colors duration-150", link)}>{n.label}</Link>)}
        </nav>
        <div className="hidden items-center gap-5 lg:flex">
          {user ? (
            <Button size="sm" href={user.role === "admin" ? "/admin" : "/app"} className={dark ? "!bg-night-text !text-night-900 hover:!bg-white" : ""}>Open dashboard</Button>
          ) : (
            <>
              <Link href="/login" className={cx("text-sm transition-colors duration-150", link)}>Log in</Link>
              <Button size="sm" href="/register" className={dark ? "!bg-night-text !text-night-900 hover:!bg-white" : ""}>Get started</Button>
            </>
          )}
        </div>
        <button className={cx("rounded-md p-2 lg:hidden", dark && "text-night-text")} onClick={() => setOpen(!open)} aria-label="Menu" aria-expanded={open}>
          {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>
      {open && (
        <div className="border-t border-line bg-white px-4 pb-5 pt-2 lg:hidden">
          {NAV.map((n) => <Link key={n.href} href={n.href} onClick={() => setOpen(false)} className="block py-3 text-[15px]">{n.label}</Link>)}
          <div className="mt-3 flex gap-3">
            {user ? <Button href="/app" className="flex-1">Open dashboard</Button> : (
              <>
                <Button href="/login" variant="secondary" className="flex-1">Log in</Button>
                <Button href="/register" className="flex-1">Get started</Button>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  );
}

export function PublicFooter() {
  return (
    <footer className="bg-night-900 text-night-soft">
      <div className="mx-auto grid max-w-content gap-10 px-4 py-14 sm:px-6 md:grid-cols-4">
        <div className="md:col-span-2">
          <Logo light />
          <p className="mt-4 max-w-sm text-sm leading-6 text-night-soft">Salary ranges from live US postings, resumes tailored to the posting, and a tracker for every application.</p>
        </div>
        <div>
          <p className="mb-3 text-sm text-night-text">Product</p>
          <ul className="space-y-2 text-sm">
            <li><Link href="/jobs" className="hover:text-night-text">Job board</Link></li>
            <li><Link href="/pricing" className="hover:text-night-text">Pricing</Link></li>
            <li><Link href="/register" className="hover:text-night-text">Create account</Link></li>
          </ul>
        </div>
        <div>
          <p className="mb-3 text-sm text-night-text">Company</p>
          <ul className="space-y-2 text-sm">
            <li><Link href="/privacy" className="hover:text-night-text">Privacy</Link></li>
            <li><Link href="/terms" className="hover:text-night-text">Terms</Link></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-night-line">
        <p className="mx-auto max-w-content px-4 py-5 font-mono text-[12px] text-night-mute sm:px-6">
          © {new Date().getFullYear()} Bespoke. Salary figures are estimates from public job postings, not guarantees. Job listings link to their original sources.
        </p>
      </div>
    </footer>
  );
}

export function PublicShell({ children, dark }: { children: React.ReactNode; dark?: boolean }) {
  return (
    <div className="relative flex min-h-screen flex-col">
      <PublicHeader dark={dark} />
      <main className="flex-1">{children}</main>
      <PublicFooter />
    </div>
  );
}
