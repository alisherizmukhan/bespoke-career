"use client";

import { Check } from "./icons";
import { useState } from "react";
import { Button, cx } from "./ui";

export type Interval = "month" | "year";

export type PlanData = {
  slug: string;
  name: string;
  tagline?: string;
  price_month: number;
  price_year: number;
  features: string[];
};

const usd = (n: number) => `$${Number.isInteger(n) ? n : n.toFixed(2)}`;

/** What a yearly plan costs per month, what it saves against 12 monthly payments, and that saving in percent. */
export function annualMath(p: PlanData) {
  const perMonth = p.price_year / 12;
  const saved = p.price_month * 12 - p.price_year;
  const pct = p.price_month ? Math.round((saved / (p.price_month * 12)) * 100) : 0;
  return { perMonth, saved, pct };
}

export function maxSavingPct(plans: PlanData[]) {
  return plans.reduce((m, p) => Math.max(m, annualMath(p).pct), 0);
}

/** Monthly / Yearly switch. Yearly carries the saving so the cheaper option is the one people read first. */
export function IntervalToggle({ value, onChange, savePct, dark }: { value: Interval; onChange: (v: Interval) => void; savePct: number; dark?: boolean }) {
  const opt = (v: Interval, label: React.ReactNode) => (
    <button type="button" role="tab" aria-selected={value === v} onClick={() => onChange(v)}
      className={cx("inline-flex h-9 items-center gap-2 rounded-sm px-4 text-[14px] font-medium transition-colors duration-150",
        value === v ? (dark ? "bg-night-text text-night-900" : "bg-ink text-white") : dark ? "text-night-soft hover:text-night-text" : "text-ink-muted hover:text-ink")}>
      {label}
    </button>
  );
  return (
    <div role="tablist" aria-label="Billing period"
      className={cx("inline-flex gap-1 rounded-md border p-1", dark ? "border-night-line bg-night-800" : "border-line bg-white")}>
      {opt("month", "Monthly")}
      {opt("year", <>Yearly{savePct > 0 && <span className={cx("rounded-sm px-1.5 py-0.5 text-[12px]", value === "year" ? "bg-accent text-white" : "bg-accent-soft text-accent-ink")}>Save {savePct}%</span>}</>)}
    </div>
  );
}

/** Price block: yearly shows the monthly equivalent next to the struck monthly price, plus the yearly total and saving. */
export function PlanPrice({ plan, interval, onPickYearly }: { plan: PlanData; interval: Interval; onPickYearly?: () => void }) {
  if (!plan.price_month) {
    return (
      <div className="mt-5">
        <p><span className="tabular text-[40px] font-semibold leading-none tracking-[-0.02em]">$0</span></p>
        <p className="mt-2 text-[13px] text-ink-muted">Free forever</p>
      </div>
    );
  }
  const { perMonth, saved } = annualMath(plan);
  if (interval === "year") {
    return (
      <div className="mt-5">
        <p className="flex items-baseline gap-2">
          <span className="tabular text-[40px] font-semibold leading-none tracking-[-0.02em]">{usd(perMonth)}</span>
          <span className="text-ink-muted">/ mo</span>
          <s className="tabular text-[15px] text-ink-faint">{usd(plan.price_month)}</s>
        </p>
        <p className="mt-2 text-[13px] text-ink-muted">
          <span className="tabular">{usd(plan.price_year)}</span> billed yearly · <span className="font-medium text-success">you save <span className="tabular">{usd(saved)}</span></span>
        </p>
      </div>
    );
  }
  return (
    <div className="mt-5">
      <p className="flex items-baseline gap-2">
        <span className="tabular text-[40px] font-semibold leading-none tracking-[-0.02em]">{usd(plan.price_month)}</span>
        <span className="text-ink-muted">/ mo</span>
      </p>
      <p className="mt-2 text-[13px] text-ink-muted">
        {onPickYearly
          ? <button type="button" onClick={onPickYearly} className="link font-medium">Or {usd(perMonth)}/mo billed yearly, save {usd(saved)}</button>
          : <>Or {usd(perMonth)}/mo billed yearly</>}
      </p>
    </div>
  );
}

/** One plan card for the landing and pricing pages. */
export function PlanCard({ plan, interval, onPickYearly, featured }: { plan: PlanData; interval: Interval; onPickYearly?: () => void; featured?: boolean }) {
  return (
    <div className={cx("relative flex flex-col rounded-lg border bg-white p-6", featured ? "border-ink shadow-pop" : "border-line")}>
      {featured && <p className="absolute -top-3 left-6 rounded-sm bg-ink px-2 py-0.5 font-mono text-[12px] text-white">Recommended</p>}
      <p className="text-[16px] font-semibold">{plan.name}</p>
      {plan.tagline && <p className="mt-1 min-h-[40px] text-[13px] text-ink-muted">{plan.tagline}</p>}
      <PlanPrice plan={plan} interval={interval} onPickYearly={onPickYearly} />
      <ul className="mt-6 flex-1 space-y-2.5 text-[13px] text-ink-muted">
        {plan.features.map((x) => <li key={x} className="flex gap-2"><Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink" />{x}</li>)}
      </ul>
      <Button href={plan.price_month ? `/register?plan=${plan.slug}&interval=${interval}` : "/register"}
        variant={featured ? "primary" : "secondary"} className="mt-6">
        {plan.price_month ? (interval === "year" ? `Get ${plan.name} yearly` : `Choose ${plan.name}`) : "Start free"}
      </Button>
    </div>
  );
}

/** Toggle + plan grid. Starts on yearly, the option most people should pick. */
export function PricingGrid({ plans, align = "start" }: { plans: PlanData[]; align?: "start" | "center" }) {
  const [interval, setInterval] = useState<Interval>("year");
  const pct = maxSavingPct(plans);
  return (
    <div>
      <div className={cx("flex flex-col gap-3 sm:flex-row sm:items-center", align === "center" ? "items-center sm:justify-center" : "items-start")}>
        <IntervalToggle value={interval} onChange={setInterval} savePct={pct} />
        {pct > 0 && <p className="text-[13px] text-ink-muted">{interval === "year" ? `Yearly plans cost up to ${pct}% less than paying monthly` : `Switch to yearly and pay up to ${pct}% less`}</p>}
      </div>
      <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {plans.map((p) => <PlanCard key={p.slug} plan={p} interval={interval} featured={p.slug === "pro"} onPickYearly={() => setInterval("year")} />)}
      </div>
    </div>
  );
}
