"use client";

import { useState } from "react";
import { Check, X } from "./icons";
import { Button, cx } from "./ui";

export type Interval = "month" | "year";

export type PlanData = {
  slug: string;
  name: string;
  tagline?: string;
  price_month: number;
  price_year: number;
  limits?: Record<string, number>;
  features: string[];
};

export const usd = (n: number) => `$${Number.isInteger(n) ? n.toLocaleString("en-US") : n.toFixed(2)}`;

/** Yearly price per month, the saving against 12 monthly payments, that saving in percent and in whole months. */
export function annualMath(p: PlanData) {
  const perMonth = p.price_year / 12;
  const saved = p.price_month * 12 - p.price_year;
  const pct = p.price_month ? Math.round((saved / (p.price_month * 12)) * 100) : 0;
  const freeMonths = p.price_month ? Math.floor(saved / p.price_month) : 0;
  return { perMonth, saved, pct, freeMonths };
}

export const maxSavingPct = (plans: PlanData[]) => plans.reduce((m, p) => Math.max(m, annualMath(p).pct), 0);

/** What one month of the plan costs on the chosen interval. */
export const monthlyCost = (p: PlanData, i: Interval) => (i === "year" ? p.price_year / 12 : p.price_month);

/** Price of one tailored resume, the thing people buy Bespoke for. */
export function perResume(p: PlanData, i: Interval) {
  const n = p.limits?.resume_generation || 0;
  return n > 0 ? monthlyCost(p, i) / n : 0;
}

export const LIMIT_ROWS: { key: string; label: string; flag?: boolean }[] = [
  { key: "resume_generation", label: "Tailored resumes per month" },
  { key: "resume_analysis", label: "Resume and ATS checks per month" },
  { key: "applications", label: "Tracked applications" },
  { key: "salary_assessment", label: "Personal salary estimates per month" },
  { key: "salary_negotiation", label: "Salary negotiation assistant", flag: true },
  { key: "assistant_messages", label: "Assistant messages per month" },
  { key: "voice_interviews", label: "Voice mock interviews per month" },
  { key: "family_seats", label: "Extra seats for family or students" },
];

export function limitText(v: number | undefined, flag?: boolean) {
  if (v === undefined || v === 0) return "—";
  if (v < 0) return flag ? "Included" : "Unlimited";
  return flag ? "Included" : v.toLocaleString("en-US");
}

/** Monthly / Yearly switch; the yearly tab carries the saving. */
export function IntervalToggle({ value, onChange, savePct }: { value: Interval; onChange: (v: Interval) => void; savePct: number }) {
  const opt = (v: Interval, label: React.ReactNode) => (
    <button type="button" role="tab" aria-selected={value === v} onClick={() => onChange(v)}
      className={cx("inline-flex h-9 items-center gap-2 rounded-sm px-4 text-[14px] font-medium transition-colors duration-150",
        value === v ? "bg-ink text-white" : "text-ink-muted hover:text-ink")}>
      {label}
    </button>
  );
  return (
    <div role="tablist" aria-label="Billing period" className="inline-flex gap-1 rounded-md border border-line bg-white p-1">
      {opt("month", "Monthly")}
      {opt("year", <>Yearly{savePct > 0 && <span className={cx("rounded-sm px-1.5 py-0.5 text-[12px]", value === "year" ? "bg-accent text-white" : "bg-accent-soft text-accent-ink")}>Save {savePct}%</span>}</>)}
    </div>
  );
}

/** Price block: monthly equivalent, struck monthly price, what is charged and when, and the saving. */
export function PlanPrice({ plan, interval, onPickYearly }: { plan: PlanData; interval: Interval; onPickYearly?: () => void }) {
  if (!plan.price_month) {
    return (
      <div className="mt-5">
        <p className="tabular text-[40px] font-semibold leading-none tracking-[-0.02em]">$0</p>
        <p className="mt-2 text-[13px] text-ink-muted">Free forever, no card needed</p>
      </div>
    );
  }
  const { perMonth, saved, freeMonths } = annualMath(plan);
  if (interval === "year") {
    return (
      <div className="mt-5">
        <p className="flex items-baseline gap-2">
          <span className="tabular text-[40px] font-semibold leading-none tracking-[-0.02em]">{usd(perMonth)}</span>
          <span className="text-ink-muted">/ mo</span>
          <s className="tabular text-[15px] text-ink-faint">{usd(plan.price_month)}</s>
        </p>
        <p className="mt-2 text-[13px] text-ink-muted">You pay <span className="tabular font-medium text-ink">{usd(plan.price_year)}</span> once a year</p>
        <p className="mt-1 text-[13px] font-medium text-success">Save {usd(saved)} a year{freeMonths >= 2 ? `, like ${freeMonths} months free` : ""}</p>
      </div>
    );
  }
  return (
    <div className="mt-5">
      <p className="flex items-baseline gap-2">
        <span className="tabular text-[40px] font-semibold leading-none tracking-[-0.02em]">{usd(plan.price_month)}</span>
        <span className="text-ink-muted">/ mo</span>
      </p>
      <p className="mt-2 text-[13px] text-ink-muted">You pay <span className="tabular font-medium text-ink">{usd(plan.price_month)}</span> every month</p>
      {onPickYearly
        ? <button type="button" onClick={onPickYearly} className="link mt-1 text-left text-[13px] font-medium">Pay yearly: {usd(perMonth)}/mo, save {usd(saved)}</button>
        : <p className="mt-1 text-[13px] text-ink-muted">Or {usd(perMonth)}/mo billed yearly</p>}
    </div>
  );
}

/** One plan card: price, what one unit of value costs, what is included, one action. */
export function PlanCard({ plan, interval, onPickYearly, featured }: { plan: PlanData; interval: Interval; onPickYearly?: () => void; featured?: boolean }) {
  const daily = monthlyCost(plan, interval) / 30.4;
  const unit = perResume(plan, interval);
  return (
    <div className={cx("relative flex flex-col rounded-lg border bg-white p-6", featured ? "border-ink shadow-pop" : "border-line")}>
      {featured && <p className="absolute -top-3 left-6 rounded-sm bg-ink px-2 py-0.5 font-mono text-[12px] text-white">Recommended</p>}
      <p className="text-[16px] font-semibold">{plan.name}</p>
      {plan.tagline && <p className="mt-1 min-h-[40px] text-[13px] text-ink-muted">{plan.tagline}</p>}
      <PlanPrice plan={plan} interval={interval} onPickYearly={onPickYearly} />
      {plan.price_month > 0 && (
        <div className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-md border border-line bg-line text-[12px]">
          <div className="bg-lavender-50 px-3 py-2"><p className="tabular text-[14px] font-semibold text-ink">{usd(Math.round(daily * 100) / 100)}</p><p className="text-ink-muted">a day</p></div>
          <div className="bg-lavender-50 px-3 py-2"><p className="tabular text-[14px] font-semibold text-ink">{usd(Math.round(unit * 100) / 100)}</p><p className="text-ink-muted">per tailored resume</p></div>
        </div>
      )}
      <p className="mt-6 text-[12px] font-medium text-ink">What you get</p>
      <ul className="mt-2 flex-1 space-y-2.5 text-[13px] text-ink-muted">
        {plan.features.map((x) => <li key={x} className="flex gap-2"><Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink" />{x}</li>)}
      </ul>
      <Button href={plan.price_month ? `/register?plan=${plan.slug}&interval=${interval}` : "/register"}
        variant={featured ? "primary" : "secondary"} className="mt-6">
        {plan.price_month ? (interval === "year" ? `Get ${plan.name} yearly` : `Choose ${plan.name}`) : "Start free"}
      </Button>
      <p className="mt-2 text-center text-[12px] text-ink-faint">{plan.price_month ? "Cancel anytime, keep access to the end of the period" : "Upgrade whenever your search picks up"}</p>
    </div>
  );
}

/** Toggle + plan grid + reassurance line. Starts on yearly. */
export function PricingGrid({ plans, align = "start" }: { plans: PlanData[]; align?: "start" | "center" }) {
  const [interval, setInterval] = useState<Interval>("year");
  const pct = maxSavingPct(plans);
  const pro = plans.find((p) => p.slug === "pro");
  return (
    <div>
      <div className={cx("flex flex-col gap-3 sm:flex-row sm:items-center", align === "center" ? "items-center sm:justify-center" : "items-start")}>
        <IntervalToggle value={interval} onChange={setInterval} savePct={pct} />
        {pro && pct > 0 && (
          <p className="text-[13px] text-ink-muted">
            {interval === "year"
              ? <>Yearly plans cost up to {pct}% less than paying monthly</>
              : <>Paying monthly costs <span className="font-medium text-ink">{usd(annualMath(pro).saved)} more a year</span> on Career Pro</>}
          </p>
        )}
      </div>
      <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {plans.map((p) => <PlanCard key={p.slug} plan={p} interval={interval} featured={p.slug === "pro"} onPickYearly={() => setInterval("year")} />)}
      </div>
      <ul className={cx("mt-6 flex flex-wrap gap-x-6 gap-y-2 text-[13px] text-ink-muted", align === "center" && "justify-center")}>
        {["Free plan with no card", "Switch or cancel from Plan & billing at any time", "Unused paid time is never cut short", "Your resumes and tracker stay yours on every plan"].map((t) => (
          <li key={t} className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-success" />{t}</li>
        ))}
      </ul>
    </div>
  );
}

/** Side-by-side limits for every plan. */
export function CompareTable({ plans }: { plans: PlanData[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-line bg-white">
      <table className="w-full min-w-[640px] text-[14px]">
        <thead>
          <tr className="border-b border-line">
            <th className="px-5 py-4 text-left font-medium text-ink-muted">What you get</th>
            {plans.map((p) => <th key={p.slug} className={cx("px-4 py-4 text-left font-semibold", p.slug === "pro" && "bg-lavender-50")}>{p.name}</th>)}
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-line">
            <td className="px-5 py-3 text-ink-muted">Live US job board and salary data</td>
            {plans.map((p) => <td key={p.slug} className={cx("px-4 py-3", p.slug === "pro" && "bg-lavender-50")}><Check className="h-4 w-4 text-ink" /></td>)}
          </tr>
          {LIMIT_ROWS.map((r) => (
            <tr key={r.key} className="border-b border-line last:border-0">
              <td className="px-5 py-3 text-ink-muted">{r.label}</td>
              {plans.map((p) => {
                const t = limitText(p.limits?.[r.key], r.flag);
                return (
                  <td key={p.slug} className={cx("tabular px-4 py-3", p.slug === "pro" && "bg-lavender-50", t === "—" ? "text-ink-faint" : "font-medium text-ink")}>
                    {t === "—" ? <X className="h-4 w-4" aria-label="Not included" /> : t}
                  </td>
                );
              })}
            </tr>
          ))}
          <tr>
            <td className="px-5 py-3 text-ink-muted">Price per month, billed yearly</td>
            {plans.map((p) => <td key={p.slug} className={cx("tabular px-4 py-3 font-semibold", p.slug === "pro" && "bg-lavender-50")}>{p.price_month ? usd(annualMath(p).perMonth) : "$0"}</td>)}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/** Plain arithmetic on the visitor's own salary: what a faster search or a slightly better offer is worth next to the plan price. */
export function PayoffCalculator({ plan }: { plan?: PlanData }) {
  const [salary, setSalary] = useState(90000);
  if (!plan) return null;
  const yearly = plan.price_year;
  const week = salary / 52;
  const raise = salary * 0.01;
  return (
    <div className="grid gap-6 rounded-lg border border-line bg-white p-6 lg:grid-cols-[1fr_1.4fr] lg:p-8">
      <div>
        <label htmlFor="salary" className="text-[14px] font-medium">Salary you're aiming for</label>
        <p className="tabular mt-2 text-[40px] font-semibold leading-none tracking-[-0.02em]">{usd(salary)}</p>
        <input id="salary" type="range" min={40000} max={250000} step={5000} value={salary} onChange={(e) => setSalary(+e.target.value)}
          className="mt-5 w-full accent-[#6c47d9]" />
        <div className="mt-1 flex justify-between font-mono text-[12px] text-ink-faint"><span>$40k</span><span>$250k</span></div>
        <p className="mt-5 text-[13px] text-ink-muted">{plan.name} costs {usd(yearly)} a year, {usd(Math.round((yearly / 52) * 100) / 100)} a week.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-md bg-lavender-50 p-5">
          <p className="text-[13px] text-ink-muted">Land the job one week sooner</p>
          <p className="tabular mt-2 text-[28px] font-semibold leading-none">{usd(Math.round(week))}</p>
          <p className="mt-2 text-[13px] text-ink-muted">in pay you'd otherwise miss, <span className="font-medium text-ink">{(week / yearly).toFixed(1)}×</span> a year of {plan.name}</p>
        </div>
        <div className="rounded-md bg-lavender-50 p-5">
          <p className="text-[13px] text-ink-muted">Negotiate just 1% higher</p>
          <p className="tabular mt-2 text-[28px] font-semibold leading-none">{usd(Math.round(raise))}</p>
          <p className="mt-2 text-[13px] text-ink-muted">more every year, <span className="font-medium text-ink">{(raise / yearly).toFixed(1)}×</span> a year of {plan.name}</p>
        </div>
        <p className="text-[12px] text-ink-faint sm:col-span-2">Examples only. Bespoke can't promise an outcome; the math shows how small a result covers the plan.</p>
      </div>
    </div>
  );
}

const FAQ: [string, string][] = [
  ["What do I pay today?", "Yearly plans are charged once for 12 months; monthly plans are charged every month. The amount on the button is the full amount, with no setup fees. Card payments are processed by Stripe; Bespoke never sees or stores your card number."],
  ["Can I cancel?", "Yes, from Plan & billing in two clicks. You keep everything you paid for until the end of the current period, then move to Free."],
  ["What happens to my resumes and applications if I downgrade?", "They stay in your account. Free keeps every resume and application you created; only new generations and analyses are limited."],
  ["Can I switch between monthly and yearly?", "Yes, at any time. Moving to yearly starts a new 12-month period at the yearly price."],
  ["Does Bespoke make things up on my resume?", "No. Resumes are built only from facts in your profile and the posting. Anything missing is flagged for you to add, never invented."],
  ["Where does the salary data come from?", "From live US job postings that disclose pay, refreshed every hour. Each estimate shows how many postings it is based on."],
];

export function PricingFaq({ items }: { items?: { q: string; a: string }[] }) {
  const list: [string, string][] = items?.length ? items.filter((i) => i.q && i.a).map((i) => [i.q, i.a]) : FAQ;
  return (
    <div className="divide-y divide-line rounded-lg border border-line bg-white">
      {list.map(([q, a]) => (
        <details key={q} className="group px-5 py-4">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[15px] font-medium">
            {q}<span className="text-ink-faint transition-transform group-open:rotate-45">+</span>
          </summary>
          <p className="mt-2 text-[14px] leading-6 text-ink-muted">{a}</p>
        </details>
      ))}
    </div>
  );
}

/** Remember the plan someone picked before signing up, so onboarding can take them straight to it. */
export function rememberPlanIntent(plan: string | null, interval: string | null) {
  try {
    if (plan && ["plus", "pro", "family"].includes(plan)) localStorage.setItem("bespoke_plan_intent", JSON.stringify({ plan, interval: interval === "month" ? "month" : "year" }));
  } catch {}
}

export function takePlanIntent(): { plan: string; interval: Interval } | null {
  try {
    const v = localStorage.getItem("bespoke_plan_intent");
    localStorage.removeItem("bespoke_plan_intent");
    return v ? JSON.parse(v) : null;
  } catch {
    return null;
  }
}
