"use client";

import { Menu, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { Button, Logo } from "./ui";

const NAV = [
  { href: "/jobs", label: "Jobs" },
  { href: "/#features", label: "Features" },
  { href: "/#salary", label: "Salary data" },
  { href: "/pricing", label: "Pricing" },
  { href: "/#students", label: "Students" },
];

export function PublicHeader() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-40 border-b border-lavender-200/70 bg-lavender-50/85 backdrop-blur">
      <div className="mx-auto flex h-[72px] max-w-content items-center justify-between px-4 sm:px-6">
        <Logo />
        <nav className="hidden items-center gap-8 lg:flex" aria-label="Main">
          {NAV.map((n) => <Link key={n.href} href={n.href} className="text-sm font-medium text-ink/80 hover:text-violet-700">{n.label}</Link>)}
        </nav>
        <div className="hidden items-center gap-3 lg:flex">
          {user ? (
            <Button href={user.role === "admin" ? "/admin" : "/app"}>Open dashboard</Button>
          ) : (
            <>
              <Link href="/login" className="text-sm font-semibold text-ink/80 hover:text-violet-700">Log in</Link>
              <Button href="/register">Get started free</Button>
            </>
          )}
        </div>
        <button className="rounded-md p-2 lg:hidden" onClick={() => setOpen(!open)} aria-label="Menu" aria-expanded={open}>
          {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>
      {open && (
        <div className="border-t border-lavender-200 bg-white px-4 pb-5 pt-2 lg:hidden">
          {NAV.map((n) => <Link key={n.href} href={n.href} onClick={() => setOpen(false)} className="block py-3 text-[15px] font-medium">{n.label}</Link>)}
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
    <footer className="bg-violet-900 text-white/80">
      <div className="mx-auto grid max-w-content gap-10 px-4 py-14 sm:px-6 md:grid-cols-4">
        <div className="md:col-span-2">
          <Logo light />
          <p className="mt-4 max-w-sm text-sm leading-6 text-white/70">Your career, thoughtfully built. Resume intelligence, real salary data, live jobs and an AI assistant that knows your search.</p>
        </div>
        <div>
          <p className="mb-3 text-sm font-semibold text-white">Product</p>
          <ul className="space-y-2 text-sm">
            <li><Link href="/jobs" className="hover:text-white">Job board</Link></li>
            <li><Link href="/pricing" className="hover:text-white">Pricing</Link></li>
            <li><Link href="/register" className="hover:text-white">Create account</Link></li>
          </ul>
        </div>
        <div>
          <p className="mb-3 text-sm font-semibold text-white">Company</p>
          <ul className="space-y-2 text-sm">
            <li><Link href="/privacy" className="hover:text-white">Privacy</Link></li>
            <li><Link href="/terms" className="hover:text-white">Terms</Link></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-white/10">
        <p className="mx-auto max-w-content px-4 py-5 text-xs text-white/50 sm:px-6">
          © {new Date().getFullYear()} Bespoke. Salary figures are estimates from public job postings, not guarantees. Job listings link to their original sources.
        </p>
      </div>
    </footer>
  );
}

export function PublicShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <PublicHeader />
      <main className="flex-1">{children}</main>
      <PublicFooter />
    </div>
  );
}
