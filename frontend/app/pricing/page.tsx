"use client";

import { useQuery } from "@tanstack/react-query";
import { PricingGrid } from "@/components/pricing";
import { PublicShell } from "@/components/public";
import { api } from "@/lib/api";

export default function Pricing() {
  const q = useQuery({ queryKey: ["plans"], queryFn: () => api("/billing/plans") });
  return (
    <PublicShell>
      <section className="border-b border-line bg-lavender-50">
        <div className="mx-auto max-w-content px-4 py-14 sm:px-6">
          <div className="text-center">
            <p className="eyebrow">Billing runs in test mode during the beta</p>
            <h1 className="h-display mt-3 text-[40px] sm:text-[56px]">Pricing</h1>
            <p className="mt-2 text-ink-muted">Every plan includes the job board and the AI assistant. Cancel anytime.</p>
          </div>
          <div className="mt-8"><PricingGrid plans={q.data?.plans || []} align="center" /></div>
          <p className="mt-8 text-center text-xs text-ink-muted">Payments currently run in test mode. No real charges are made.</p>
        </div>
      </section>
    </PublicShell>
  );
}
