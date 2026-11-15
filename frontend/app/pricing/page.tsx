"use client";

import { useQuery } from "@tanstack/react-query";
import { CompareTable, PayoffCalculator, PricingFaq, PricingGrid, type PlanData } from "@/components/pricing";
import { PublicShell } from "@/components/public";
import { api } from "@/lib/api";
import { useContent } from "@/lib/content";

export default function Pricing() {
  const q = useQuery({ queryKey: ["plans"], queryFn: () => api("/billing/plans") });
  const plans: PlanData[] = q.data?.plans || [];
  const c = useContent();
  return (
    <PublicShell>
      <section className="border-b border-line bg-lavender-50">
        <div className="mx-auto max-w-content px-4 py-14 sm:px-6">
          <div className="text-center">
            <p className="eyebrow">{q.data?.provider === "stripe" ? (q.data.live ? "Secure payments by Stripe" : "Payments by Stripe, test mode") : "Billing runs in test mode during the beta"}</p>
            <h1 className="h-display mt-3 text-[40px] sm:text-[56px]">{c.pricing?.headline || "Plans for every stage of your search"}</h1>
            <p className="mx-auto mt-3 max-w-xl text-[17px] text-ink-muted">{c.pricing?.subhead || "Start free. When you're applying every week, Career Pro on the yearly plan costs less than a dollar a day, and you can cancel the moment you sign an offer."}</p>
          </div>
          <div className="mt-10"><PricingGrid plans={plans} align="center" /></div>
        </div>
      </section>

      <section className="bg-white">
        <div className="mx-auto max-w-content px-4 py-20 sm:px-6">
          <h2 className="h-display text-[32px] sm:text-[40px]">What a plan pays back</h2>
          <p className="mt-2 max-w-2xl text-ink-muted">Move the slider to your target salary. A small result covers a year of Career Pro many times over.</p>
          <div className="mt-8"><PayoffCalculator plan={plans.find((p) => p.slug === "pro")} /></div>
        </div>
      </section>

      <section id="compare" className="border-t border-line bg-lavender-50">
        <div className="mx-auto max-w-content px-4 py-20 sm:px-6">
          <h2 className="h-display text-[32px] sm:text-[40px]">Compare plans</h2>
          <p className="mt-2 text-ink-muted">Every limit, side by side. Limits reset on the first of each month.</p>
          <div className="mt-8"><CompareTable plans={plans} /></div>
        </div>
      </section>

      <section className="border-t border-line bg-white">
        <div className="mx-auto grid max-w-content gap-10 px-4 py-20 sm:px-6 lg:grid-cols-[1fr_1.6fr]">
          <div>
            <h2 className="h-display text-[32px] sm:text-[40px]">Questions before you pay</h2>
            <p className="mt-2 text-ink-muted">What you're charged, what you keep and how to leave.</p>
          </div>
          <PricingFaq items={c.pricing_faq?.items} />
        </div>
      </section>
    </PublicShell>
  );
}
