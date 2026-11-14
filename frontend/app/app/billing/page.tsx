"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check } from "@/components/icons";
import { useState } from "react";
import { Badge, Button, Card, ErrorState, InlineError, PageHeader, Skeleton, Tabs } from "@/components/ui";
import { api } from "@/lib/api";
import { date, money } from "@/lib/format";

export default function Billing() {
  const qc = useQueryClient();
  const [interval, setInterval] = useState<"month" | "year">("month");
  const sub = useQuery({ queryKey: ["subscription"], queryFn: () => api("/billing/subscription") });
  const plans = useQuery({ queryKey: ["plans"], queryFn: () => api("/billing/plans") });
  const history = useQuery({ queryKey: ["billing-history"], queryFn: () => api("/billing/history") });
  const refresh = () => ["subscription", "billing-history", "dashboard"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
  const change = useMutation({ mutationFn: (plan: string) => api(sub.data?.subscription ? "/billing/change-plan" : "/billing/checkout", { body: { plan, interval } }), onSuccess: refresh });
  const cancel = useMutation({ mutationFn: () => api("/billing/cancel", { method: "POST" }), onSuccess: refresh });
  const resume = useMutation({ mutationFn: () => api("/billing/resume", { method: "POST" }), onSuccess: refresh });
  if (sub.isLoading) return <Skeleton className="h-96" />;
  if (sub.isError) return <ErrorState error={sub.error} retry={() => sub.refetch()} />;
  const cur = sub.data.plan.slug;
  const s = sub.data.subscription;
  return (
    <div>
      <PageHeader title="Plan & billing" subtitle="Change plans anytime. Limits reset at the start of each month." />
      <div className="mb-5 rounded-lg border border-dashed border-warning bg-warning-soft px-4 py-3 text-sm text-warning">
        <b>Test mode.</b> Checkout records a test subscription and a test payment. No card is charged and no money moves.
      </div>
      <Card className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="flex-1">
          <p className="text-sm text-ink-muted">Current plan</p>
          <p className="text-[22px] font-medium">{sub.data.plan.name}</p>
          {s && <p className="text-sm text-ink-muted">{s.cancel_at_period_end ? `Ends on ${date(s.current_period_end)}` : `Renews ${date(s.current_period_end)} · billed ${s.interval}ly`}</p>}
        </div>
        {s && (s.cancel_at_period_end
          ? <Button variant="secondary" loading={resume.isPending} onClick={() => resume.mutate()}>Keep my plan</Button>
          : <Button variant="danger" loading={cancel.isPending} onClick={() => confirm("Cancel at the end of the billing period?") && cancel.mutate()}>Cancel plan</Button>)}
      </Card>
      <div className="mb-4 flex justify-center"><Tabs value={interval} onChange={setInterval} items={[{ value: "month", label: "Monthly" }, { value: "year", label: "Yearly" }]} /></div>
      <InlineError error={change.error || cancel.error} />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {(plans.data?.plans || []).map((p: any) => (
          <Card key={p.slug} className={`flex flex-col ${p.slug === cur ? "border-ink" : ""}`}>
            <div className="flex items-center justify-between"><p className="text-[15px] font-medium">{p.name}</p>{p.slug === cur && <Badge tone="info">Current</Badge>}</div>
            <p className="mt-2"><span className="tabular text-[32px] font-medium leading-none">${interval === "year" ? p.price_year : p.price_month}</span><span className="text-sm text-ink-muted">/{interval === "year" ? "yr" : "mo"}</span></p>
            <ul className="mt-4 flex-1 space-y-2 text-[13px]">{p.features.map((f: string) => <li key={f} className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-violet-600" />{f}</li>)}</ul>
            {p.slug !== cur && p.slug !== "free" && <Button className="mt-5" loading={change.isPending && change.variables === p.slug} onClick={() => change.mutate(p.slug)}>Switch to {p.name}</Button>}
          </Card>
        ))}
      </div>
      <h2 className="mb-3 mt-8 text-lg font-medium">Billing history</h2>
      <Card className="!p-0">
        {history.data?.length ? (
          <table className="w-full text-sm"><tbody>{history.data.map((h: any) => (
            <tr key={h.id} className="border-b border-line last:border-0">
              <td className="px-5 py-3">{date(h.created_at)}</td><td className="px-5 py-3">{h.description}</td>
              <td className="tabular px-5 py-3 text-right">{money(h.amount)}</td><td className="px-5 py-3 text-right">{h.is_test && <Badge tone="warning">Test</Badge>}</td>
            </tr>
          ))}</tbody></table>
        ) : <p className="p-6 text-sm text-ink-muted">No payments yet.</p>}
      </Card>
    </div>
  );
}
