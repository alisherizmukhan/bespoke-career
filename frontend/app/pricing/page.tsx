"use client";

import { useQuery } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { useState } from "react";
import { PublicShell } from "@/components/public";
import { Button, Tabs } from "@/components/ui";
import { api } from "@/lib/api";

export default function Pricing() {
  const [interval, setInterval] = useState<"month" | "year">("month");
  const q = useQuery({ queryKey: ["plans"], queryFn: () => api("/billing/plans") });
  return (
    <PublicShell>
      <section className="bg-gradient-to-b from-lavender-100 to-lavender-50">
        <div className="mx-auto max-w-content px-4 py-14 sm:px-6">
          <div className="text-center">
            <span className="eyebrow">Pricing</span>
            <h1 className="h-display mt-4 text-[40px] sm:text-[52px]">Invest in your <span className="text-violet-600">next move.</span></h1>
            <p className="mt-2 text-ink-muted">Every plan includes the job board and the AI assistant. Cancel anytime.</p>
            <div className="mt-6"><Tabs value={interval} onChange={setInterval} items={[{ value: "month", label: "Monthly" }, { value: "year", label: "Yearly · save ~17%" }]} /></div>
          </div>
          <div className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
            {(q.data?.plans || []).map((p: any) => (
              <div key={p.slug} className={`card flex flex-col p-6 ${p.slug === "pro" ? "ring-2 ring-violet-600" : ""}`}>
                <p className="font-display text-lg font-bold">{p.name}</p>
                <p className="mt-1 min-h-[40px] text-[13px] text-ink-muted">{p.tagline}</p>
                <p className="mt-4">
                  <span className="tabular font-display text-4xl font-extrabold">${interval === "year" ? p.price_year : p.price_month}</span>
                  <span className="text-ink-muted">/{interval === "year" ? "yr" : "mo"}</span>
                </p>
                <ul className="mt-5 flex-1 space-y-2.5 text-[13px]">{p.features.map((x: string) => <li key={x} className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-violet-600" />{x}</li>)}</ul>
                <Button href={`/register?plan=${p.slug}`} variant={p.slug === "pro" ? "primary" : "secondary"} className="mt-6">{p.price_month ? `Choose ${p.name}` : "Start free"}</Button>
              </div>
            ))}
          </div>
          <p className="mt-8 text-center text-xs text-ink-muted">Payments currently run in test mode — no real charges are made.</p>
        </div>
      </section>
    </PublicShell>
  );
}
