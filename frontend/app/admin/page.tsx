"use client";

import { useQuery } from "@tanstack/react-query";
import { Activity, Briefcase, CreditCard, DollarSign, FileText, KanbanSquare, MessageSquare, TrendingUp, UserCheck, Users } from "@/components/icons";
import { Card, ErrorState, PageHeader, Skeleton, StatCard } from "@/components/ui";
import { api } from "@/lib/api";
import { money } from "@/lib/format";

export default function AdminMetrics() {
  const q = useQuery({ queryKey: ["admin-metrics"], queryFn: () => api("/admin/metrics") });
  if (q.isLoading) return <Skeleton className="h-96" />;
  if (q.isError) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  const m = q.data;
  const maxW = Math.max(1, ...m.weekly.map((w: any) => Math.max(w.signups, w.applications)));
  return (
    <div>
      <PageHeader title="Metrics" subtitle={`Product and subscription metrics · billing in ${m.billing_mode} mode`} />
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard icon={Users} label="Users" value={m.users} sub={`${m.activated} activated`} />
        <StatCard icon={UserCheck} label="DAU / MAU" value={`${m.dau} / ${m.mau}`} />
        <StatCard icon={CreditCard} label="Paying accounts" value={m.paying} sub={`${m.conversion}% conversion`} tone="success" />
        <StatCard icon={DollarSign} label="MRR (test)" value={money(m.mrr)} sub={`ARR ${money(m.arr)} · ARPA ${money(m.arpa)}`} tone="success" />
        <StatCard icon={FileText} label="Resumes" value={m.resumes} sub={`${m.resume_versions} versions`} />
        <StatCard icon={KanbanSquare} label="Applications tracked" value={m.applications} />
        <StatCard icon={MessageSquare} label="Assistant messages" value={m.assistant_messages} sub={`${m.ai_calls_30d} AI calls / 30d`} />
        <StatCard icon={Briefcase} label="Active jobs" value={m.jobs_active.toLocaleString("en-US")} sub={`${m.salary_assessments} salary assessments`} />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <Card>
          <p className="mb-4 flex items-center gap-2 font-medium"><TrendingUp className="h-4 w-4 text-violet-600" />Last 8 weeks</p>
          <div className="flex h-48 items-end gap-3">
            {m.weekly.map((w: any) => (
              <div key={w.period} className="flex flex-1 flex-col items-center gap-1">
                <div className="flex h-40 w-full items-end justify-center gap-1">
                  <div className="w-1/2 rounded-t bg-violet-600" style={{ height: `${(w.signups / maxW) * 100}%` }} title={`${w.signups} signups`} />
                  <div className="w-1/2 rounded-t bg-violet-300" style={{ height: `${(w.applications / maxW) * 100}%` }} title={`${w.applications} applications`} />
                </div>
                <span className="text-xs text-ink-muted">{w.period.slice(5)}</span>
              </div>
            ))}
          </div>
          <p className="mt-3 flex gap-4 text-xs text-ink-muted"><span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-violet-600" />Signups</span><span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-violet-300" />Applications</span></p>
        </Card>
        <Card>
          <p className="mb-3 flex items-center gap-2 font-medium"><Activity className="h-4 w-4 text-violet-600" />Plan mix</p>
          {m.plan_mix.length ? m.plan_mix.map((p: any) => <div key={p.plan + p.interval} className="flex justify-between border-b border-line py-2 text-sm last:border-0"><span className="capitalize">{p.plan} · {p.interval}ly</span><span className="tabular font-medium">{p.count}</span></div>) : <p className="text-sm text-ink-muted">No paid subscriptions yet.</p>}
        </Card>
      </div>
    </div>
  );
}
