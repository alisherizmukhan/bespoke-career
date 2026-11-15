"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ExportButtons, Stat, StagePill, STAGE_TONE, usd0 } from "@/components/admin-tools";
import { ErrorState, Input, LoadingCards, PageHeader, Select, cx } from "@/components/ui";
import { api } from "@/lib/api";
import { date } from "@/lib/format";

function ago(d?: string | null) {
  if (!d) return "Never";
  const days = Math.floor((Date.now() - new Date(d).getTime()) / 86400000);
  return days <= 0 ? "Today" : days === 1 ? "Yesterday" : `${days}d ago`;
}

export default function Crm() {
  const [q, setQ] = useState("");
  const [stage, setStage] = useState("");
  const [plan, setPlan] = useState("");
  const [tag, setTag] = useState("");
  const [sort, setSort] = useState("newest");
  useEffect(() => { const v = new URLSearchParams(window.location.search).get("q"); if (v) setQ(v); }, []);
  const ov = useQuery({ queryKey: ["crm-overview"], queryFn: () => api("/admin/crm/overview") });
  const list = useQuery({
    queryKey: ["crm-customers", q, stage, plan, tag, sort],
    queryFn: () => api(`/admin/crm/customers?${new URLSearchParams({ q, stage, plan, tag, sort })}`),
  });
  const o = ov.data;
  const maxSignup = Math.max(1, ...(o?.signups || []).map((s: any) => s.count));
  const totalStage = Math.max(1, (o?.stages || []).reduce((a: number, s: any) => a + s.count, 0));

  return (
    <div>
      <PageHeader title="CRM" subtitle="Every customer, their plan, revenue, activity and your notes in one place." actions={<ExportButtons dataset="customers" />} />

      {o && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Stat label="Monthly recurring revenue" value={usd0(o.mrr)} sub={`${usd0(o.arr)} a year · ARPU ${usd0(o.arpu)}`} />
            <Stat label="Paying customers" value={o.paying} sub={`${o.conversion}% of ${o.customers} customers`} />
            <Stat label="On yearly billing" value={`${o.yearly_share}%`} sub="of paying customers" />
            <Stat label="Open tasks" value={o.tasks_open} sub={<><span className={o.tasks_overdue ? "font-medium text-danger" : ""}>{o.tasks_overdue} overdue</span> · {o.follow_ups_due} follow-ups due</>} />
          </div>

          <div className="mt-3 grid gap-3 lg:grid-cols-[1.4fr_1fr]">
            <div className="rounded-lg border border-line bg-white p-5">
              <p className="text-small text-ink-muted">Customers by stage</p>
              <div className="mt-3 flex h-3 overflow-hidden rounded-sm bg-lavender-100">
                {o.stages.filter((s: any) => s.count).map((s: any) => (
                  <div key={s.stage} className={cx(STAGE_TONE[s.stage])} style={{ width: `${(s.count / totalStage) * 100}%` }} title={`${s.label}: ${s.count}`} />
                ))}
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {o.stages.map((s: any) => (
                  <button key={s.stage} type="button" onClick={() => setStage(stage === s.stage ? "" : s.stage)}
                    className={cx("rounded-md border px-3 py-2 text-left transition-colors", stage === s.stage ? "border-ink" : "border-line hover:border-violet-300")}>
                    <StagePill stage={s.stage} />
                    <p className="tabular mt-1.5 text-xl font-semibold">{s.count}</p>
                  </button>
                ))}
              </div>
            </div>
            <div className="rounded-lg border border-line bg-white p-5">
              <p className="text-small text-ink-muted">Signups, last 30 days</p>
              <p className="tabular mt-1 text-2xl font-semibold">{o.signups.reduce((a: number, s: any) => a + s.count, 0)}</p>
              <div className="mt-3 flex h-24 items-end gap-[3px]">
                {o.signups.map((s: any, i: number) => (
                  <div key={s.day} title={`${s.day}: ${s.count}`} className={cx("flex-1 rounded-t-[2px]", i === o.signups.length - 1 ? "bg-accent" : "bg-violet-200")}
                    style={{ height: `${Math.max(4, (s.count / maxSignup) * 100)}%` }} />
                ))}
              </div>
              <div className="mt-1 flex justify-between font-mono text-xs text-ink-faint"><span>{o.signups[0]?.day.slice(5)}</span><span>Today</span></div>
            </div>
          </div>
        </>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, email or tag" className="max-w-xs" aria-label="Search customers" />
        <Select value={stage} onChange={(e) => setStage(e.target.value)} className="max-w-[170px]" aria-label="Stage">
          <option value="">All stages</option>
          {(list.data?.stages || []).map((s: any) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </Select>
        <Select value={plan} onChange={(e) => setPlan(e.target.value)} className="max-w-[150px]" aria-label="Plan">
          <option value="">All plans</option>
          {["free", "plus", "pro", "family"].map((p) => <option key={p} value={p}>{p[0].toUpperCase() + p.slice(1)}</option>)}
        </Select>
        <Select value={tag} onChange={(e) => setTag(e.target.value)} className="max-w-[150px]" aria-label="Tag">
          <option value="">All tags</option>
          {(list.data?.tags || []).map((t: string) => <option key={t} value={t}>{t}</option>)}
        </Select>
        <Select value={sort} onChange={(e) => setSort(e.target.value)} className="max-w-[190px]" aria-label="Sort">
          <option value="newest">Newest first</option><option value="revenue">Lifetime revenue</option><option value="mrr">MRR</option>
          <option value="engagement">Engagement</option><option value="last_seen">Recently active</option><option value="follow_up">Follow-up date</option>
        </Select>
        <span className="ml-auto text-small text-ink-muted">{list.data?.total ?? "…"} customers</span>
      </div>

      <div className="mt-3">
        {list.isLoading ? <LoadingCards /> : list.isError ? <ErrorState error={list.error} retry={() => list.refetch()} /> : (
          <div className="overflow-x-auto rounded-lg border border-line bg-white">
            <table className="w-full min-w-[1080px] text-sm">
              <thead className="border-b border-line bg-lavender-50 text-left text-small text-ink-muted">
                <tr>{["Customer", "Stage", "Plan", "MRR", "Lifetime", "Activity", "Engagement", "Last seen", "Follow-up", "Tags"].map((h) => <th key={h} className="px-4 py-3 font-medium">{h}</th>)}</tr>
              </thead>
              <tbody>
                {list.data.items.map((c: any) => (
                  <tr key={c.id} className="border-b border-line last:border-0 hover:bg-lavender-50">
                    <td className="px-4 py-3">
                      <Link href={`/admin/crm/${c.id}`} className="font-medium hover:underline">{c.full_name || c.email.split("@")[0]}</Link>
                      <p className="text-xs text-ink-muted">{c.email}</p>
                    </td>
                    <td className="px-4 py-3"><StagePill stage={c.stage} manual={c.stage_manual} /></td>
                    <td className="px-4 py-3 capitalize">{c.plan}{c.interval && <span className="text-xs text-ink-muted"> · {c.interval}ly</span>}</td>
                    <td className="tabular px-4 py-3">{c.mrr ? usd0(c.mrr) : "—"}</td>
                    <td className="tabular px-4 py-3">{c.lifetime_revenue ? usd0(c.lifetime_revenue) : "—"}</td>
                    <td className="px-4 py-3 text-xs text-ink-muted">{c.applications} apps · {c.resumes} resumes · {c.ai_calls} AI</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-16 overflow-hidden rounded-full bg-lavender-100"><div className="h-full bg-ink" style={{ width: `${c.engagement}%` }} /></div>
                        <span className="tabular text-xs text-ink-muted">{c.engagement}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-ink-muted">{ago(c.last_seen_at)}</td>
                    <td className={cx("px-4 py-3", c.follow_up_at && new Date(c.follow_up_at) <= new Date() ? "font-medium text-danger" : "text-ink-muted")}>{c.follow_up_at ? date(c.follow_up_at) : "—"}</td>
                    <td className="px-4 py-3"><div className="flex flex-wrap gap-1">{c.tags.map((t: string) => <span key={t} className="rounded-sm bg-lavender-100 px-1.5 py-0.5 text-xs">{t}</span>)}</div></td>
                  </tr>
                ))}
                {!list.data.items.length && <tr><td colSpan={10} className="px-4 py-10 text-center text-ink-muted">No customers match these filters</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
