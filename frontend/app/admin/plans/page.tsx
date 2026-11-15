"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Button, Card, ErrorState, Field, InlineError, Input, PageHeader, Skeleton } from "@/components/ui";
import { api } from "@/lib/api";

const FEATURES: [string, string][] = [
  ["resume_generation", "Resume generations / mo"], ["resume_analysis", "Resume analyses / mo"], ["applications", "Tracked applications (total)"],
  ["salary_assessment", "Salary assessments / mo"], ["salary_negotiation", "Negotiation sessions / mo"], ["assistant_messages", "Assistant messages / mo"],
  ["voice_interviews", "Voice interviews / mo"], ["family_seats", "Family seats"],
];

function PlanCard({ p }: { p: any }) {
  const qc = useQueryClient();
  const [f, setF] = useState<any>(null);
  useEffect(() => setF({ price_month: p.price_month, price_year: p.price_year, limits: { ...p.limits } }), [p]);
  const save = useMutation({ mutationFn: () => api(`/admin/plans/${p.slug}`, { method: "PATCH", body: f }), onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-plans"] }) });
  if (!f) return null;
  return (
    <Card className="space-y-4">
      <p className="text-body font-medium">{p.name}</p>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Monthly $" id={`${p.slug}-m`}><Input id={`${p.slug}-m`} type="number" value={f.price_month} onChange={(e) => setF({ ...f, price_month: Number(e.target.value) })} /></Field>
        <Field label="Yearly $" id={`${p.slug}-y`}><Input id={`${p.slug}-y`} type="number" value={f.price_year} onChange={(e) => setF({ ...f, price_year: Number(e.target.value) })} /></Field>
      </div>
      <div className="space-y-2">
        {FEATURES.map(([k, l]) => (
          <label key={k} className="flex items-center justify-between gap-3 text-sm"><span className="text-ink-muted">{l}</span>
            <Input type="number" value={f.limits[k] ?? 0} onChange={(e) => setF({ ...f, limits: { ...f.limits, [k]: Number(e.target.value) } })} className="!min-h-[36px] w-24 py-1 text-right" aria-label={l} />
          </label>
        ))}
      </div>
      <p className="text-xs text-ink-muted">-1 = unlimited, 0 = not included.</p>
      <InlineError error={save.error} />
      <Button loading={save.isPending} onClick={() => save.mutate()} className="w-full">{save.isSuccess ? "Saved" : "Save plan"}</Button>
    </Card>
  );
}

export default function Plans() {
  const q = useQuery({ queryKey: ["admin-plans"], queryFn: () => api("/admin/plans") });
  if (q.isLoading) return <Skeleton className="h-96" />;
  if (q.isError) return <ErrorState error={q.error} />;
  return (
    <div>
      <PageHeader title="Plans & limits" subtitle="Prices and monthly limits are enforced by the entitlement service on every request." />
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">{q.data.map((p: any) => <PlanCard key={p.slug} p={p} />)}</div>
    </div>
  );
}
