"use client";

import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight, Bell, Check, FileText, GraduationCap, KanbanSquare, MessageSquare, Target, Wallet, Wand2,
} from "@/components/icons";
import Link from "next/link";
import { PricingGrid } from "@/components/pricing";
import { PublicShell } from "@/components/public";
import { Button, RangeMarker, ScoreRing, cx } from "@/components/ui";
import { api } from "@/lib/api";
import { useContent } from "@/lib/content";
import { money } from "@/lib/format";

type Hist = { count: number; median: number | null; p25: number | null; p75: number | null; start: number; step: number; bins: number[] };

const FEATURES = [
  { icon: Wallet, title: "Salary ranges from live postings", body: "Percentiles for your title and city, with the sample size and sources shown.", href: "/register" },
  { icon: FileText, title: "Resumes for your field", body: "Twelve formats, from ATS-friendly to academic, federal and internship.", href: "/register" },
  { icon: Target, title: "Check a resume against a posting", body: "Matched and missing requirements, before a recruiter sees it.", href: "/register" },
  { icon: KanbanSquare, title: "Track every application", body: "Board, table or list, with interview stages and follow-up dates.", href: "/register" },
  { icon: Bell, title: "Follow-up reminders", body: "Nudges when an application has been quiet for a week.", href: "/register" },
  { icon: MessageSquare, title: "An assistant that knows your search", body: "Ask which companies haven't replied or what to prepare next.", href: "/register" },
  { icon: Wand2, title: "Cover letters from your own facts", body: "Drafts that use only what's in your verified resume.", href: "/register" },
  { icon: GraduationCap, title: "Students and first jobs", body: "Projects, coursework and activities first, no work history needed.", href: "/register" },
];

/** The hero moment: real distribution of posted base pay, drawn as bars across the hero. */
function PayHistogram({ h }: { h?: Hist }) {
  const bins = h?.bins?.length ? h.bins : Array.from({ length: 37 }, (_, i) => 20 + Math.round(60 * Math.exp(-(((i - 18) / 9) ** 2))));
  const max = Math.max(...bins);
  const medianBin = h?.median ? Math.floor((h.median - h.start) / h.step) : -1;
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[58%] overflow-hidden" aria-hidden>
      <div className="mx-auto flex h-full max-w-[1400px] items-end gap-[3px] px-4 sm:gap-1.5 sm:px-6">
        {bins.map((v, i) => (
          <div key={i} className={cx("flex-1 rounded-t-[3px]", i === medianBin ? "bg-night-500" : "bg-night-700")}
            style={{ height: `${12 + (v / max) * 88}%` }} />
        ))}
      </div>
      <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-night-900 to-transparent" />
    </div>
  );
}

function ResumeCard() {
  return (
    <div className="rounded-xl border border-line bg-white p-5 text-ink shadow-float">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-small text-ink-faint">Resume match</p>
          <p className="mt-1 text-body font-medium leading-snug">Senior Data Analyst<br />at Stripe</p>
        </div>
        <ScoreRing score={86} size={72} />
      </div>
      <ul className="mt-5 space-y-2 text-small">
        {[["SQL", true], ["Python", true], ["Tableau", true], ["dbt", false]].map(([k, ok]) => (
          <li key={k as string} className="flex items-center justify-between border-t border-line pt-2">
            <span>{k}</span>
            {ok ? <span className="inline-flex items-center gap-1 text-success"><Check className="h-3.5 w-3.5" />In resume</span>
              : <span className="text-warning">Missing</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

function SalaryCard({ h }: { h?: Hist }) {
  const low = 92000, high = 128000, you = 116000, min = 68000, max = 152000;
  const pos = (v: number) => `${((v - min) / (max - min)) * 100}%`;
  return (
    <div className="rounded-xl border border-line bg-white p-6 text-ink shadow-float">
      <p className="text-small text-ink-faint">Your estimated range</p>
      <p className="mt-1 text-body font-medium">Data Analyst · Chicago, IL</p>
      <p className="tabular mt-4 font-display font-semibold text-display-sm leading-none">{money(low, { compact: true })} – {money(high, { compact: true })}</p>
      <p className="mt-2 text-small text-ink-muted">Base pay per year, 214 postings with disclosed salary</p>
      <div className="relative mt-10">
        <div className="relative h-2 rounded-full bg-lavender-100">
          <div className="absolute h-2 rounded-full bg-violet-300" style={{ left: pos(low), width: `calc(${pos(high)} - ${pos(low)})` }} />
        </div>
        <RangeMarker left={pos(you)} />
        <div className="tabular mt-2 flex justify-between font-mono text-xs text-ink-faint">
          <span>{money(min, { compact: true })}</span><span>median {money(108000, { compact: true })}</span><span>{money(max, { compact: true })}</span>
        </div>
      </div>
      {h?.count ? <p className="mt-5 border-t border-line pt-3 font-mono text-xs text-ink-faint">Built from {h.count.toLocaleString("en-US")} live listings with pay</p> : null}
    </div>
  );
}

function PipelineCard() {
  const rows: [string, number][] = [["Applied", 12], ["Screening", 4], ["Interview", 2], ["Offer", 1]];
  return (
    <div className="rounded-xl border border-night-line bg-night-800 p-5 text-night-text shadow-float">
      <p className="text-small text-night-mute">Applications this month</p>
      <p className="tabular mt-1 text-h3 font-medium leading-none">12</p>
      <ul className="mt-5 space-y-3">
        {rows.map(([label, n]) => (
          <li key={label}>
            <div className="flex justify-between text-small"><span className="text-night-soft">{label}</span><span className="tabular font-mono">{n}</span></div>
            <div className="mt-1.5 h-1 rounded-full bg-night-700">
              <div className={cx("h-1 rounded-full", label === "Offer" ? "bg-accent" : "bg-night-soft/60")} style={{ width: `${(n / 12) * 100}%` }} />
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-5 border-t border-night-line pt-3 text-small text-night-soft">Ramp hasn&apos;t replied in 8 days</p>
    </div>
  );
}

export default function Landing() {
  const facets = useQuery({ queryKey: ["facets"], queryFn: () => api("/jobs/facets") });
  const hist = useQuery({ queryKey: ["salary-hist"], queryFn: () => api<Hist>("/jobs/salary-histogram") });
  const plans = useQuery({ queryKey: ["plans"], queryFn: () => api("/billing/plans") });
  const hero = useContent().landing_hero;
  const f = facets.data;

  return (
    <PublicShell dark>
      {/* HERO — ink, centered short headline, real pay distribution behind the product cards */}
      <section className="relative bg-night-900 text-night-text">
        <PayHistogram h={hist.data} />
        <div className="relative mx-auto max-w-content px-4 pb-0 pt-32 text-center sm:px-6 sm:pt-36">
          <p className="font-mono text-xs text-night-mute">
            {f ? `${f.total.toLocaleString("en-US")} open US jobs · ${f.with_salary.toLocaleString("en-US")} with posted pay · updated hourly` : "Open US jobs, updated hourly"}
          </p>
          <h1 className="mx-auto mt-6 max-w-3xl font-display font-semibold text-display-sm leading-[1.04] tracking-[-0.035em] sm:text-display-lg">
            {hero?.headline || "Know what your role pays before you apply"}
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-lg leading-[1.6] text-night-soft">
            {hero?.subhead || "Bespoke reads live US job postings so you can see your market pay, tailor your resume to the posting and keep every application moving."}
          </p>
          <div className="mt-9 flex flex-wrap items-center justify-center gap-5">
            <Button href="/register" size="lg" className="!bg-night-text !text-night-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.4)] hover:!bg-white">{hero?.cta || "Create a free account"}</Button>
            <Link href="/jobs" className="inline-flex items-center gap-1.5 text-body text-night-soft transition-colors duration-150 hover:text-night-text">
              Browse jobs <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <p className="mt-16 font-mono text-xs text-night-mute">
            {hist.data?.median ? `Bars: posted base pay across ${hist.data.count.toLocaleString("en-US")} listings, $30k to $400k · median ${money(hist.data.median, { compact: true })}` : " "}
          </p>
          {/* product view rising from the bottom edge */}
          <div className="relative z-10 mt-6 grid translate-y-24 gap-4 text-left lg:grid-cols-[1fr_1.25fr_1fr] lg:items-end">
            <div className="hidden lg:block"><ResumeCard /></div>
            <SalaryCard h={hist.data} />
            <div className="hidden lg:block"><PipelineCard /></div>
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section id="features" className="bg-lavender-50 pt-36">
        <div className="mx-auto max-w-content px-4 pb-24 sm:px-6">
          <div className="max-w-2xl">
            <h2 className="h-display text-h1 leading-[1.08] sm:text-display">One search, from posting to offer</h2>
            <p className="mt-4 text-lg leading-7 text-ink-muted">Every tool reads the same profile, so your salary estimate, resume and applications stay in step.</p>
          </div>
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((x, i) => (
              <Link key={x.title} href={x.href}
                className={cx("group flex flex-col rounded-lg border p-6 transition-colors duration-150",
                  i === 0 ? "border-night-900 bg-night-900 text-night-text" : "border-line bg-white hover:border-violet-300")}>
                <x.icon className={cx("h-5 w-5", i === 0 ? "text-night-soft" : "text-ink-faint")} />
                <p className="mt-6 text-body font-medium leading-snug">{x.title}</p>
                <p className={cx("mt-2 flex-1 text-small leading-5", i === 0 ? "text-night-soft" : "text-ink-muted")}>{x.body}</p>
                <span className={cx("mt-5 inline-flex items-center gap-1 text-small", i === 0 ? "text-night-text" : "text-ink")}>
                  Learn more <ArrowRight className="h-3.5 w-3.5 transition-transform duration-150 group-hover:translate-x-0.5" />
                </span>
              </Link>
            ))}
          </div>
          <p className="mt-10 font-mono text-xs leading-6 text-ink-faint">
            Openings come from company career sites on Greenhouse, Ashby and Lever, plus Talent.com, Remotive, Remote OK, Himalayas and Jobicy. Every listing links to the original posting.
          </p>
        </div>
      </section>

      {/* SALARY DATA */}
      <section id="salary" className="border-t border-line bg-white">
        <div className="mx-auto grid max-w-content gap-12 px-4 py-24 sm:px-6 lg:grid-cols-2 lg:items-center">
          <div>
            <h2 className="h-display text-4xl leading-[1.1] sm:text-display-sm">Salary numbers you can check</h2>
            <p className="mt-4 text-lg leading-7 text-ink-muted">
              Estimates come from postings that disclose pay, mostly from states with pay-transparency laws. You see the sample size, the sources and the dates behind every range, and the AI explains numbers without inventing them.
            </p>
          </div>
          <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line">
            {[
              ["Listings with pay", f ? f.with_salary.toLocaleString("en-US") : "—"],
              ["Hiring companies", f ? f.companies.toLocaleString("en-US") : "—"],
              ["Median posted base", hist.data?.median ? money(hist.data.median, { compact: true }) : "—"],
              ["Middle half", hist.data?.p25 ? `${money(hist.data.p25, { compact: true })}–${money(hist.data.p75, { compact: true })}` : "—"],
            ].map(([k, v]) => (
              <div key={k} className="bg-white p-6">
                <dt className="text-small text-ink-muted">{k}</dt>
                <dd className="tabular mt-2 text-h3 font-medium leading-none">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* STUDENTS */}
      <section id="students" className="border-t border-line bg-lavender-50">
        <div className="mx-auto grid max-w-content gap-10 px-4 py-24 sm:px-6 md:grid-cols-2 md:items-center">
          <div>
            <h2 className="h-display text-4xl leading-[1.1] sm:text-display-sm">For students and first jobs</h2>
            <p className="mt-4 text-lg leading-7 text-ink-muted">Internship resumes without work history, academic CVs and graduate applications. Family plans keep every profile private by default.</p>
          </div>
          <ul className="divide-y divide-line rounded-lg border border-line bg-white">
            {["Student, internship and graduate CV formats", "Projects, coursework and activities first", "Separate, private accounts on family plans", "Only facts you add — nothing invented"].map((t) => (
              <li key={t} className="flex items-center gap-3 px-5 py-4 text-body"><Check className="h-4 w-4 shrink-0 text-ink-faint" />{t}</li>
            ))}
          </ul>
        </div>
      </section>

      {/* PRICING */}
      <section className="border-t border-line bg-white">
        <div className="mx-auto max-w-content px-4 py-24 sm:px-6">
          <h2 className="h-display text-4xl sm:text-display-sm">Pricing</h2>
          <p className="mt-2 text-ink-muted">Start free. Upgrade when your search picks up.</p>
          <div className="mt-8"><PricingGrid plans={plans.data?.plans || []} /></div>
          <p className="mt-6 text-sm"><Link href="/pricing#compare" className="link font-medium">Compare every limit and see what a plan pays back →</Link></p>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-night-900 text-night-text">
        <div className="mx-auto flex max-w-content flex-col items-start gap-6 px-4 py-20 sm:px-6 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="font-display font-semibold text-4xl leading-tight sm:text-display-sm">See your range in two minutes</p>
            <p className="mt-2 text-night-soft">Create a profile, add your title and city, and get your first estimate.</p>
          </div>
          <Button href="/register" size="lg" className="!bg-night-text !text-night-900 hover:!bg-white">Create a free account</Button>
        </div>
      </section>
    </PublicShell>
  );
}
