"use client";

import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight, Briefcase, Building2, Check, DollarSign, FileText, GraduationCap, KanbanSquare, LineChart, MessageSquare,
  Mic, Search, ShieldCheck, Sparkles, Star, Target, TrendingUp, Users, Wallet,
} from "lucide-react";
import Link from "next/link";
import { PublicShell } from "@/components/public";
import { Button, ScoreRing, Sparkle } from "@/components/ui";
import { api } from "@/lib/api";

const FEATURES = [
  { icon: FileText, title: "Resume Intelligence", body: "Profession-aware resumes and CVs, from ATS-friendly to academic and federal." },
  { icon: Target, title: "ATS optimization", body: "See matched and missing requirements against any job description." },
  { icon: Wallet, title: "Salary Intelligence", body: "Market ranges from live postings with disclosed pay, plus your personal estimate." },
  { icon: KanbanSquare, title: "Job Tracker", body: "Kanban, table and list views, interviews and follow-up reminders." },
  { icon: MessageSquare, title: "AI Career Assistant", body: "Answers grounded in your own profile, resumes and applications." },
  { icon: GraduationCap, title: "Students & family", body: "Internship resumes, application help and private family seats." },
];

export default function Landing() {
  const facets = useQuery({ queryKey: ["facets"], queryFn: () => api("/jobs/facets") });
  const plans = useQuery({ queryKey: ["plans"], queryFn: () => api("/billing/plans") });
  const f = facets.data;
  const fmt = (n?: number) => (n ? n.toLocaleString() : "—");

  return (
    <PublicShell>
      {/* HERO */}
      <section className="relative overflow-hidden bg-gradient-to-b from-lavender-100 to-lavender-50">
        <div className="mx-auto grid max-w-content items-center gap-12 px-4 pb-16 pt-12 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:pb-24 lg:pt-16">
          <div>
            <span className="eyebrow">AI-powered career intelligence</span>
            <h1 className="h-display mt-6 text-[44px] leading-[1.02] sm:text-[60px] lg:text-[68px]">
              Know your worth.
              <span className="block text-violet-600">Build the career you want.</span>
            </h1>
            <p className="mt-6 max-w-xl text-[17px] leading-7 text-ink-muted">
              Bespoke connects your resume, real salary data, live job openings and interview prep into one thoughtful
              workspace — with an AI assistant that actually knows your search.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <Button href="/register" size="lg">Start free <ArrowRight className="h-4 w-4" /></Button>
              <Link href="/jobs" className="inline-flex items-center gap-2 text-[15px] font-semibold text-violet-700 hover:text-violet-900">
                <Search className="h-4 w-4" /> Browse {f ? fmt(f.total) : ""} live jobs
              </Link>
            </div>
            <div className="mt-9 flex items-center gap-4">
              <div className="flex -space-x-2">
                {["AM", "JR", "SK", "LP"].map((i, n) => (
                  <span key={i} className="grid h-9 w-9 place-items-center rounded-full border-2 border-lavender-50 text-xs font-bold text-white"
                    style={{ background: ["#6C47D9", "#A68BEE", "#4A2DB5", "#1E1645"][n] }}>{i}</span>
                ))}
              </div>
              <div className="text-[13px] text-ink-muted">
                <div className="flex gap-0.5 text-rating">{[0, 1, 2, 3, 4].map((i) => <Star key={i} className="h-4 w-4 fill-current" />)}</div>
                Free plan, no credit card. Upgrade only when you need more.
              </div>
            </div>
          </div>

          {/* Product composition with floating stat cards */}
          <div className="relative mx-auto w-full max-w-[520px] xl:flex xl:max-w-none xl:items-center">
            <div className="absolute -right-10 -top-10 h-72 w-72 rounded-full bg-violet-400/25 blur-3xl" aria-hidden />
            <div className="absolute -bottom-6 left-0 h-56 w-56 rounded-full bg-violet-300/30 blur-3xl" aria-hidden />
            <Sparkle className="absolute -left-4 top-6 h-8 w-8 text-ink" />
            <Sparkle className="absolute -right-2 bottom-24 h-6 w-6 text-violet-600" />
            <div className="relative rounded-xl border border-white bg-white/90 p-5 shadow-float backdrop-blur sm:p-6 xl:w-[410px] xl:shrink-0">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Resume match</p>
                  <p className="mt-1 font-display text-lg font-bold">Senior Data Analyst · Stripe</p>
                </div>
                <ScoreRing score={86} size={84} label="ATS" />
              </div>
              <div className="mt-5 space-y-2">
                {[["SQL", true], ["Python", true], ["Tableau", true], ["dbt", false]].map(([k, ok]) => (
                  <div key={k as string} className="flex items-center justify-between rounded-md bg-lavender-50 px-3 py-2 text-sm">
                    <span className="font-medium">{k}</span>
                    {ok ? <span className="inline-flex items-center gap-1 text-xs font-semibold text-success"><Check className="h-3.5 w-3.5" />In your resume</span>
                      : <span className="text-xs font-semibold text-warning">Missing — add if you have it</span>}
                  </div>
                ))}
              </div>
              <div className="mt-5 rounded-lg bg-violet-900 p-4 text-white">
                <p className="text-xs text-white/70">Your estimated range · Austin, TX</p>
                <p className="tabular mt-1 font-display text-2xl font-bold">$112k – $138k</p>
                <div className="mt-3 h-2 rounded-full bg-white/15"><div className="ml-[28%] h-2 w-[38%] rounded-full bg-violet-300" /></div>
                <p className="mt-2 text-[11px] text-white/60">From public postings with disclosed pay</p>
              </div>
            </div>
            <div className="relative z-10 mt-4 grid grid-cols-3 gap-2 xl:-ml-8 xl:mt-0 xl:flex xl:w-44 xl:shrink-0 xl:flex-col xl:gap-3">
              {[{ i: Briefcase, v: fmt(f?.total), l: "Live jobs indexed" }, { i: Building2, v: fmt(f?.companies), l: "Hiring companies" }, { i: DollarSign, v: fmt(f?.with_salary), l: "With disclosed pay" }].map((s) => (
                <div key={s.l} className="flex flex-col items-start gap-2 rounded-lg border border-white bg-white p-3 shadow-card sm:flex-row sm:items-center sm:gap-3 sm:p-3.5">
                  <span className="grid h-9 w-9 place-items-center rounded-full bg-violet-100 text-violet-600"><s.i className="h-4 w-4" /></span>
                  <div><p className="tabular font-display text-lg font-bold leading-none">{s.v}</p><p className="mt-1 text-[11px] text-ink-muted">{s.l}</p></div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="mx-auto max-w-content px-4 pb-14 sm:px-6">
          <div className="card px-6 py-6 text-center">
            <p className="text-[15px] text-ink-muted">Live openings from public job APIs and career sites</p>
            <div className="mt-4 flex flex-wrap items-center justify-center gap-x-10 gap-y-3 font-display text-lg font-bold text-ink/70">
              {["Greenhouse", "Ashby", "Lever", "Talent.com", "Remotive", "Himalayas", "Remote OK", "Jobicy"].map((s) => <span key={s}>{s}</span>)}
            </div>
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section id="features" className="bg-white">
        <div className="mx-auto max-w-content px-4 py-20 sm:px-6">
          <h2 className="h-display max-w-xl text-[34px] leading-tight sm:text-[42px]">Everything you need to grow your career</h2>
          <div className="mt-12 grid gap-y-10 sm:grid-cols-2 lg:grid-cols-6 lg:divide-x lg:divide-line">
            {FEATURES.map((x) => (
              <div key={x.title} className="flex flex-col items-center px-4 text-center">
                <span className="grid h-16 w-16 place-items-center rounded-full bg-violet-100 text-violet-600"><x.icon className="h-7 w-7" strokeWidth={1.7} /></span>
                <p className="mt-4 font-semibold text-ink">{x.title}</p>
                <p className="mt-2 text-[13px] leading-5 text-ink-muted">{x.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* INSIDE */}
      <section id="salary" className="bg-lavender-100">
        <div className="mx-auto grid max-w-content items-center gap-12 px-4 py-20 sm:px-6 lg:grid-cols-2">
          <div>
            <h2 className="h-display text-[32px] leading-tight sm:text-[40px]">Inside your workspace</h2>
            <p className="mt-2 text-[17px] text-ink-muted">One profile. Every career decision connected.</p>
            <div className="mt-8 grid grid-cols-2 gap-6">
              {[{ i: LineChart, t: "Real salary data", d: "Percentiles, sources and sample sizes" }, { i: ShieldCheck, t: "No invented facts", d: "Resumes use only what you verified" },
                { i: TrendingUp, t: "Growth plans", d: "Skills that pay more in your field" }, { i: Mic, t: "Interview prep", d: "Practice questions from your applications" }].map((x) => (
                <div key={x.t} className="flex gap-3">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white text-violet-600"><x.i className="h-5 w-5" /></span>
                  <div><p className="text-sm font-semibold">{x.t}</p><p className="text-[13px] text-ink-muted">{x.d}</p></div>
                </div>
              ))}
            </div>
          </div>
          <div className="card relative p-5 shadow-float">
            <div className="flex items-center gap-2 rounded-md bg-lavender-50 px-3 py-2 text-[13px] text-ink-muted"><Search className="h-4 w-4" /> Ask Bespoke anything about your search…</div>
            <div className="mt-4 space-y-3 text-sm">
              <div className="ml-auto max-w-[80%] rounded-lg rounded-br-sm bg-violet-600 px-4 py-2.5 text-white">Which companies haven't responded yet?</div>
              <div className="max-w-[88%] rounded-lg rounded-bl-sm bg-lavender-50 px-4 py-3 text-ink">
                Two applications haven't moved in over a week:
                <ul className="mt-2 space-y-1 text-[13px]"><li>• <b>Stripe</b> — Backend Engineer (12 days)</li><li>• <b>Ramp</b> — Senior Engineer (8 days)</li></ul>
                <p className="mt-2 text-[13px] text-ink-muted">Want me to draft a short follow-up?</p>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2">
              {[["Applied", "12"], ["Interviews", "3"], ["Offers", "1"]].map(([l, v]) => (
                <div key={l} className="rounded-md border border-line p-3 text-center"><p className="tabular font-display text-xl font-bold">{v}</p><p className="text-[11px] text-ink-muted">{l}</p></div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* STUDENTS */}
      <section id="students" className="bg-white">
        <div className="mx-auto grid max-w-content gap-10 px-4 py-20 sm:px-6 md:grid-cols-[1fr_1.2fr] md:items-center">
          <div className="rounded-xl bg-violet-900 p-8 text-white">
            <GraduationCap className="h-10 w-10 text-violet-300" />
            <p className="mt-4 font-display text-2xl font-bold">For students and recent graduates</p>
            <p className="mt-2 text-sm leading-6 text-white/75">Internship resumes without work history, academic CVs, graduate applications and scholarships — with private profiles that family members can't see by default.</p>
          </div>
          <ul className="space-y-4">
            {["Student, internship and graduate CV formats", "Projects, coursework, volunteering and leadership first", "Family plans with separate, private accounts", "Never invents achievements — only what you add"].map((t) => (
              <li key={t} className="flex items-start gap-3 text-[15px]"><span className="mt-0.5 grid h-6 w-6 place-items-center rounded-full bg-success-soft text-success"><Check className="h-4 w-4" /></span>{t}</li>
            ))}
          </ul>
        </div>
      </section>

      {/* PRICING */}
      <section className="bg-lavender-100">
        <div className="mx-auto max-w-content px-4 py-20 sm:px-6">
          <div className="text-center">
            <h2 className="h-display text-[32px] sm:text-[40px]">Simple, honest pricing</h2>
            <p className="mt-2 text-ink-muted">Start free. Upgrade when your search picks up.</p>
          </div>
          <div className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
            {(plans.data?.plans || []).map((p: any) => (
              <div key={p.slug} className={`card flex flex-col p-6 ${p.slug === "pro" ? "border-violet-600 ring-2 ring-violet-600" : ""}`}>
                {p.slug === "pro" && <span className="mb-3 self-start rounded-full bg-violet-600 px-2.5 py-1 text-[11px] font-semibold text-white">Most popular</span>}
                <p className="font-display text-lg font-bold">{p.name}</p>
                <p className="mt-1 text-[13px] text-ink-muted">{p.tagline}</p>
                <p className="mt-4"><span className="tabular font-display text-4xl font-extrabold">${p.price_month}</span><span className="text-ink-muted">/mo</span></p>
                <ul className="mt-5 flex-1 space-y-2.5 text-[13px]">
                  {p.features.map((x: string) => <li key={x} className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-violet-600" />{x}</li>)}
                </ul>
                <Button href="/register" variant={p.slug === "pro" ? "primary" : "secondary"} className="mt-6">{p.price_month ? `Choose ${p.name}` : "Start free"}</Button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-lavender-50">
        <div className="mx-auto max-w-content px-4 py-16 sm:px-6">
          <div className="card flex flex-col items-center gap-6 p-8 text-center md:flex-row md:text-left">
            <span className="grid h-20 w-20 shrink-0 place-items-center rounded-full bg-violet-100 text-violet-600"><Sparkles className="h-9 w-9" /></span>
            <div className="flex-1">
              <p className="h-display text-[26px] leading-tight sm:text-[30px]">Your next role, thoughtfully built.</p>
              <p className="mt-1 text-ink-muted">Create your profile in two minutes and get your first resume score today.</p>
            </div>
            <div className="flex flex-col items-center gap-2">
              <Button href="/register" size="lg">Get started free <ArrowRight className="h-4 w-4" /></Button>
              <span className="inline-flex items-center gap-1 text-xs text-ink-muted"><Users className="h-3.5 w-3.5" /> No credit card required</span>
            </div>
          </div>
        </div>
      </section>
    </PublicShell>
  );
}
