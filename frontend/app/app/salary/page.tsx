"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { BarChart3, Handshake, Info, TrendingUp, UserRound } from "@/components/icons";
import { useEffect, useState } from "react";
import { Badge, Button, Card, Field, InlineError, Input, PageHeader, Select, Tabs, Textarea } from "@/components/ui";
import { api } from "@/lib/api";
import { date, money } from "@/lib/format";

type Tab = "market" | "me" | "growth" | "negotiate";

function RangeBar({ stats, mark }: { stats: any; mark?: { low: number; high: number } }) {
  const lo = stats.min, hi = stats.max, span = hi - lo || 1;
  const pos = (v: number) => `${Math.max(0, Math.min(100, ((v - lo) / span) * 100))}%`;
  return (
    <div className="pt-6">
      <div className="relative h-3 rounded-full bg-violet-100">
        <div className="absolute h-3 rounded-full bg-violet-300" style={{ left: pos(stats.p25), width: `calc(${pos(stats.p75)} - ${pos(stats.p25)})` }} />
        <div className="absolute -top-1 h-5 w-1 rounded bg-violet-700" style={{ left: pos(stats.median) }} title="Median" />
        {mark && <div className="absolute -top-2 h-7 rounded-md border-2 border-success bg-success/10" style={{ left: pos(mark.low), width: `calc(${pos(mark.high)} - ${pos(mark.low)})` }} />}
      </div>
      <div className="tabular mt-2 flex justify-between text-xs text-ink-muted"><span>{money(lo, { compact: true })}</span><span>Median {money(stats.median, { compact: true })}</span><span>{money(hi, { compact: true })}</span></div>
    </div>
  );
}

function MarketView({ m }: { m: any }) {
  if (!m.sample_size) return <p className="rounded-md bg-warning-soft px-4 py-3 text-sm text-warning">{m.message}</p>;
  const s = m.stats;
  const maxSen = Math.max(...Object.values<any>(m.by_seniority).map((x) => x.median));
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><p className="text-[18px] font-medium">{m.title}</p><p className="text-sm text-ink-muted">{m.location}{m.seniority ? ` · ${m.seniority}` : ""} · {m.compensation_type}</p></div>
        <Badge tone="info">{m.sample_size} postings</Badge>
      </div>
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
        {[["Min", s.min], ["25th", s.p25], ["Median", s.median], ["Average", s.mean], ["75th", s.p75], ["Max", s.max]].map(([l, v]) => (
          <div key={l as string} className="rounded-md bg-lavender-50 p-3"><p className="text-xs text-ink-muted">{l}</p><p className="tabular font-medium">{money(v as number, { compact: true })}</p></div>
        ))}
      </div>
      <RangeBar stats={s} />
      {Object.keys(m.by_seniority).length > 1 && (
        <div><p className="mb-2 text-sm font-medium">Median by level</p>
          <div className="space-y-2">{Object.entries<any>(m.by_seniority).map(([k, v]) => (
            <div key={k} className="flex items-center gap-3 text-sm"><span className="w-24 capitalize text-ink-muted">{k}</span><div className="h-2.5 flex-1 rounded-full bg-violet-100"><div className="h-2.5 rounded-full bg-violet-600" style={{ width: `${(v.median / maxSen) * 100}%` }} /></div><span className="tabular w-20 text-right">{money(v.median, { compact: true })}</span><span className="w-10 text-xs text-ink-muted">n={v.sample}</span></div>
          ))}</div>
        </div>
      )}
      <div className="rounded-lg bg-lavender-50 p-4 text-xs text-ink-muted">
        <p className="mb-1 flex items-center gap-1 font-medium text-ink"><Info className="h-3.5 w-3.5" />Sources & limitations</p>
        <p>Sources: {m.sources.join(", ")}. Observed {date(m.observation_window.from)} – {date(m.observation_window.to)}.</p>
        <ul className="mt-1 list-disc pl-4">{m.limitations.map((l: string) => <li key={l}>{l}</li>)}</ul>
        {m.top_companies?.length > 0 && <p className="mt-1">Top employers in sample: {m.top_companies.join(", ")}.</p>}
      </div>
    </div>
  );
}

export default function Salary() {
  const [tab, setTab] = useState<Tab>("market");
  const profile = useQuery({ queryKey: ["profile"], queryFn: () => api("/profile") });
  const history = useQuery({ queryKey: ["salary-history"], queryFn: () => api("/salary-intelligence/history") });
  const [mf, setMf] = useState({ title: "", location: "", seniority: "" });
  const [nf, setNf] = useState({ title: "", location: "", base: "", bonus: "", equity_yearly: "", notes: "" });
  useEffect(() => {
    const p = profile.data;
    if (p) {
      const t = p.target_title || p.current_title || "";
      setMf((f) => ({ ...f, title: f.title || t, location: f.location || p.city || "" }));
      setNf((f) => ({ ...f, title: f.title || t, location: f.location || p.city || "" }));
    }
  }, [profile.data]);
  const market = useMutation({ mutationFn: () => api("/salary-intelligence/market-research", { body: { title: mf.title, location: mf.location || null, seniority: mf.seniority || null } }) });
  const assess = useMutation({ mutationFn: () => api("/salary-intelligence/assess", { body: {} }), onSuccess: () => history.refetch() });
  const growth = useMutation({ mutationFn: () => api("/salary-intelligence/growth-plan", { body: {} }) });
  const negotiate = useMutation({ mutationFn: () => api("/salary-intelligence/negotiate", { body: { title: nf.title, location: nf.location || null, base: Number(nf.base), bonus: Number(nf.bonus || 0), equity_yearly: Number(nf.equity_yearly || 0), notes: nf.notes } }) });

  return (
    <div>
      <PageHeader title="Salary Intelligence" subtitle="Market ranges and personal estimates computed from live US job postings with disclosed pay." />
      <div className="mb-5 overflow-x-auto"><Tabs value={tab} onChange={setTab} items={[{ value: "market", label: "Market research", icon: BarChart3 }, { value: "me", label: "My estimate", icon: UserRound }, { value: "growth", label: "Growth plan", icon: TrendingUp }, { value: "negotiate", label: "Negotiation", icon: Handshake }]} /></div>

      {tab === "market" && (
        <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
          <Card className="space-y-4 self-start">
            <Field label="Job title" id="mt"><Input id="mt" value={mf.title} onChange={(e) => setMf({ ...mf, title: e.target.value })} placeholder="e.g. Registered Nurse" /></Field>
            <Field label="Location" id="ml" hint="City, ST — or “Remote”. Leave empty for national."><Input id="ml" value={mf.location} onChange={(e) => setMf({ ...mf, location: e.target.value })} /></Field>
            <Field label="Level" id="ms"><Select id="ms" value={mf.seniority} onChange={(e) => setMf({ ...mf, seniority: e.target.value })}><option value="">All levels</option>{["intern", "entry", "mid", "senior", "lead", "executive"].map((s) => <option key={s} value={s}>{s}</option>)}</Select></Field>
            <Button className="w-full" loading={market.isPending} disabled={mf.title.length < 2} onClick={() => market.mutate()}>Research market</Button>
            <InlineError error={market.error} />
          </Card>
          <Card>{market.data ? <MarketView m={market.data} /> : <p className="py-16 text-center text-sm text-ink-muted">Enter a job title to see the salary range, percentiles and sample details.</p>}</Card>
        </div>
      )}

      {tab === "me" && (
        <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
          <Card>
            {!assess.data ? (
              <div className="py-10 text-center">
                <p className="font-medium">Personal salary estimate</p>
                <p className="mx-auto mt-1 max-w-md text-sm text-ink-muted">Uses your target title ({profile.data?.target_title || profile.data?.current_title || "not set"}), experience, skills, education and location.</p>
                <Button className="mt-5" loading={assess.isPending} onClick={() => assess.mutate()}>Estimate my salary</Button>
                <div className="mx-auto mt-4 max-w-md"><InlineError error={assess.error} /></div>
              </div>
            ) : assess.data.estimate ? (
              <div className="space-y-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div><p className="text-sm text-ink-muted">{assess.data.title} · {assess.data.location}</p><p className="tabular text-[32px] font-medium leading-none">{money(assess.data.estimate.low, { compact: true })} – {money(assess.data.estimate.high, { compact: true })}</p><p className="text-sm text-ink-muted">Midpoint {money(assess.data.estimate.mid)} per year</p></div>
                  <Badge tone={assess.data.confidence === "high" ? "success" : assess.data.confidence === "medium" ? "info" : "warning"}>{assess.data.confidence} confidence</Badge>
                </div>
                <RangeBar stats={assess.data.market.stats} mark={assess.data.estimate} />
                <div><p className="mb-2 text-sm font-medium">What influenced it</p><ul className="space-y-1.5 text-sm">{assess.data.factors.map((f: string) => <li key={f}>• {f}</li>)}</ul></div>
                {assess.data.explanation && <div className="rounded-lg bg-violet-100 p-4 text-sm text-violet-900"><p>{assess.data.explanation.summary}</p></div>}
                {assess.data.missing_information.length > 0 && <p className="rounded-md bg-warning-soft px-3 py-2 text-sm text-warning">Add to improve accuracy: {assess.data.missing_information.join(", ")}.</p>}
                <p className="text-xs text-ink-muted">{assess.data.disclaimer} Based on {assess.data.market.sample_size} postings.</p>
              </div>
            ) : <MarketView m={assess.data} />}
          </Card>
          <Card>
            <p className="mb-3 font-medium">Previous estimates</p>
            {history.data?.length ? history.data.map((h: any) => (
              <div key={h.id} className="flex items-center justify-between border-b border-line py-2.5 text-sm last:border-0"><span>{h.title}<span className="block text-xs text-ink-muted">{date(h.created_at)}</span></span><span className="tabular font-medium">{money(h.estimate.mid, { compact: true })}</span></div>
            )) : <p className="text-sm text-ink-muted">None yet.</p>}
          </Card>
        </div>
      )}

      {tab === "growth" && (
        <Card>
          {!growth.data ? (
            <div className="py-10 text-center"><p className="font-medium">What could increase your earning potential?</p><p className="mx-auto mt-1 max-w-md text-sm text-ink-muted">We compare postings for your target role to find skills and milestones associated with higher pay.</p><Button className="mt-5" loading={growth.isPending} onClick={() => growth.mutate()}>Build my growth plan</Button><div className="mx-auto mt-4 max-w-md"><InlineError error={growth.error} /></div></div>
          ) : (
            <div className="space-y-6">
              <p className="text-sm text-ink-muted">Current estimate for {growth.data.title}: <b className="text-ink">{money(growth.data.current.low, { compact: true })}–{money(growth.data.current.high, { compact: true })}</b></p>
              <div className="grid gap-4 md:grid-cols-2">
                <div><p className="mb-2 font-medium">Scenarios</p>{growth.data.scenarios.length ? growth.data.scenarios.map((s: any) => <div key={s.milestone} className="mb-2 flex items-center justify-between rounded-md border border-line p-3 text-sm"><span>{s.milestone}<span className="block text-xs text-ink-muted">{s.sample} postings</span></span><span className="tabular font-medium text-success">{money(s.median, { compact: true })}</span></div>) : <p className="text-sm text-ink-muted">Not enough data for scenarios yet.</p>}</div>
                <div><p className="mb-2 font-medium">Skills to build</p>{growth.data.skills_to_build.map((s: any) => <div key={s.skill} className="mb-2 flex items-center justify-between rounded-md bg-lavender-50 p-3 text-sm"><span className="capitalize">{s.skill}<span className="block text-xs text-ink-muted">in {s.postings} postings</span></span><span className={`tabular font-medium ${s.premium_pct >= 0 ? "text-success" : "text-ink-muted"}`}>{s.premium_pct > 0 ? "+" : ""}{s.premium_pct}%</span></div>)}</div>
              </div>
              <p className="text-xs text-ink-muted">{growth.data.disclaimer}</p>
            </div>
          )}
        </Card>
      )}

      {tab === "negotiate" && (
        <div className="grid gap-5 lg:grid-cols-[360px_1fr]">
          <Card className="space-y-4 self-start">
            <p className="font-medium">Analyze an offer</p>
            <Field label="Job title" id="nt"><Input id="nt" value={nf.title} onChange={(e) => setNf({ ...nf, title: e.target.value })} /></Field>
            <Field label="Location" id="nl"><Input id="nl" value={nf.location} onChange={(e) => setNf({ ...nf, location: e.target.value })} /></Field>
            <div className="grid grid-cols-3 gap-2">
              <Field label="Base" id="nb"><Input id="nb" type="number" value={nf.base} onChange={(e) => setNf({ ...nf, base: e.target.value })} placeholder="95000" /></Field>
              <Field label="Bonus" id="nbo"><Input id="nbo" type="number" value={nf.bonus} onChange={(e) => setNf({ ...nf, bonus: e.target.value })} /></Field>
              <Field label="Equity/yr" id="ne"><Input id="ne" type="number" value={nf.equity_yearly} onChange={(e) => setNf({ ...nf, equity_yearly: e.target.value })} /></Field>
            </div>
            <Field label="Context (optional)" id="nn"><Textarea id="nn" value={nf.notes} onChange={(e) => setNf({ ...nf, notes: e.target.value })} className="min-h-[80px]" placeholder="Competing offers, scope, start date…" /></Field>
            <Button className="w-full" loading={negotiate.isPending} disabled={!nf.base || nf.title.length < 2} onClick={() => negotiate.mutate()}>Get negotiation plan</Button>
            <InlineError error={negotiate.error} />
          </Card>
          <Card>
            {!negotiate.data ? <p className="py-16 text-center text-sm text-ink-muted">Enter the offer to compare it with the market and draft a counteroffer.</p> : (
              <div className="space-y-5">
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-md bg-lavender-50 p-3"><p className="text-xs text-ink-muted">Offer (base)</p><p className="tabular text-lg font-medium">{money(negotiate.data.offer.base)}</p></div>
                  <div className="rounded-md bg-lavender-50 p-3"><p className="text-xs text-ink-muted">Market percentile</p><p className="tabular text-lg font-medium">{negotiate.data.offer_percentile}th</p></div>
                  <div className="rounded-md bg-success-soft p-3"><p className="text-xs text-success">Suggested counter</p><p className="tabular text-lg font-medium text-success">{money(negotiate.data.suggested_counter.low, { compact: true })}–{money(negotiate.data.suggested_counter.high, { compact: true })}</p></div>
                </div>
                <RangeBar stats={negotiate.data.market.stats} mark={negotiate.data.suggested_counter} />
                <div><p className="mb-2 text-sm font-medium">Arguments</p><ul className="space-y-1.5 text-sm">{negotiate.data.arguments.map((a: string) => <li key={a}>• {a}</li>)}</ul></div>
                <div><p className="mb-2 text-sm font-medium">Draft message</p><Textarea defaultValue={negotiate.data.message} className="min-h-[180px]" /></div>
                <p className="text-xs text-ink-muted">{negotiate.data.disclaimer}</p>
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
