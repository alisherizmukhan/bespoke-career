"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Play, Plus, RefreshCw } from "@/components/icons";
import { useState } from "react";
import { Badge, Button, Card, ErrorState, Field, InlineError, Input, Modal, PageHeader, Select, Skeleton, Textarea } from "@/components/ui";
import { api } from "@/lib/api";
import { ago } from "@/lib/format";

const HELP: Record<string, string> = {
  telegram: '{"channel": "remotejobs", "pages": 3}',
  greenhouse: '{"board": "airbnb", "company": "Airbnb"}',
  ashby: '{"board": "ramp", "company": "Ramp"}',
  lever: '{"company": "spotify", "company_name": "Spotify"}',
  talent: '{"k": "nurse", "l": "Dallas, TX", "pages": 2}',
  adzuna: '{"what": "nurse", "where": "Texas", "pages": 2}',
  usajobs: '{"keyword": "analyst", "limit": 250}',
  remotive: '{"category": "software-dev"}', remoteok: "{}", himalayas: '{"pages": 10}', jobicy: '{"geo": "usa"}',
};

export default function Sources() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["admin-sources"], queryFn: () => api("/admin/job-sources"), refetchInterval: 15_000 });
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ kind: "telegram", name: "", config: HELP.telegram });
  const refresh = () => qc.invalidateQueries({ queryKey: ["admin-sources"] });
  const run = useMutation({ mutationFn: (source?: string) => api(`/admin/job-sources/run${source ? `?source=${encodeURIComponent(source)}` : ""}`, { method: "POST" }), onSuccess: () => setTimeout(refresh, 3000) });
  const toggle = useMutation({ mutationFn: (s: any) => api(`/admin/job-sources/${s.id}`, { method: "PATCH", body: { is_active: !s.is_active } }), onSuccess: refresh });
  const add = useMutation({
    mutationFn: () => api("/admin/job-sources", { body: { kind: form.kind, name: form.name, config: JSON.parse(form.config || "{}") } }),
    onSuccess: () => { setAdding(false); refresh(); },
  });
  if (q.isLoading) return <Skeleton className="h-96" />;
  if (q.isError) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  const totals = q.data.sources.reduce((a: number, s: any) => a + s.active_jobs, 0);
  return (
    <div>
      <PageHeader title="Job sources" subtitle={`${q.data.sources.length} sources · ${totals.toLocaleString("en-US")} active jobs · runs automatically every hour; each source respects its own interval.`}
        actions={<><Button variant="secondary" onClick={() => setAdding(true)}><Plus className="h-4 w-4" />Add source</Button><Button loading={run.isPending} onClick={() => run.mutate(undefined)}><Play className="h-4 w-4" />Run all now</Button></>} />
      {run.isSuccess && <p className="mb-4 rounded-md bg-success-soft px-4 py-2 text-sm text-success">Ingestion started in the background. Statuses refresh automatically.</p>}
      <InlineError error={run.error} />
      <Card className="!p-0 overflow-x-auto">
        <table className="w-full min-w-[860px] text-sm">
          <thead className="border-b border-line bg-lavender-50 text-left text-[13px] text-ink-muted"><tr>{["Source", "Provider", "Status", "Last run", "Found / new", "Active jobs", ""].map((h) => <th key={h} className="px-4 py-3 font-medium">{h}</th>)}</tr></thead>
          <tbody>{q.data.sources.map((s: any) => (
            <tr key={s.id} className="border-b border-line last:border-0">
              <td className="px-4 py-3"><p className="font-medium">{s.name}</p><p className="max-w-[260px] truncate text-xs text-ink-muted">{JSON.stringify(s.config)}</p></td>
              <td className="px-4 py-3">{s.provider}</td>
              <td className="px-4 py-3">{!s.is_active ? <Badge tone="neutral">Off</Badge> : s.last_status === "success" ? <Badge tone="success">OK</Badge> : s.last_status === "failed" ? <Badge tone="danger">Failed</Badge> : s.last_status === "running" ? <Badge tone="info">Running</Badge> : <Badge tone="neutral">Never run</Badge>}
                {s.last_error && <p className="mt-1 max-w-[240px] text-xs text-danger" title={s.last_error}>{s.last_error.slice(0, 90)}</p>}</td>
              <td className="px-4 py-3 text-ink-muted">{s.last_run_at ? ago(s.last_run_at) : "—"}</td>
              <td className="tabular px-4 py-3">{s.last_found} / {s.last_created}</td>
              <td className="tabular px-4 py-3 font-medium">{s.active_jobs}</td>
              <td className="whitespace-nowrap px-4 py-3 text-right">
                <Button size="sm" variant="ghost" onClick={() => run.mutate(s.id)} aria-label="Run now"><RefreshCw className="h-4 w-4" /></Button>
                <Button size="sm" variant="ghost" onClick={() => toggle.mutate(s)}>{s.is_active ? "Disable" : "Enable"}</Button>
              </td>
            </tr>
          ))}</tbody>
        </table>
      </Card>
      <h2 className="mb-3 mt-8 font-medium">Recent runs</h2>
      <Card className="!p-0 overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm"><tbody>{q.data.recent_runs.map((r: any, i: number) => (
          <tr key={i} className="border-b border-line last:border-0"><td className="px-4 py-2.5">{r.source}</td><td className="px-4 py-2.5">{r.status === "success" ? <Badge tone="success">OK</Badge> : r.status === "failed" ? <Badge tone="danger">Failed</Badge> : <Badge tone="info">{r.status}</Badge>}</td><td className="tabular px-4 py-2.5 text-ink-muted">{r.fetched} fetched · {r.created} new · {r.updated} updated</td><td className="px-4 py-2.5 text-ink-muted">{ago(r.started_at)}</td></tr>
        ))}</tbody></table>
      </Card>
      <Modal open={adding} onClose={() => setAdding(false)} title="Add job source">
        <div className="space-y-4">
          <Field label="Provider" id="k"><Select id="k" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value, config: HELP[e.target.value] || "{}" })}>{q.data.kinds.map((k: any) => <option key={k.kind} value={k.kind}>{k.name}</option>)}</Select></Field>
          <Field label="Display name" id="n"><Input id="n" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Telegram · US Remote Jobs" /></Field>
          <Field label="Config (JSON)" id="c" hint={`Example: ${HELP[form.kind] || "{}"}`}><Textarea id="c" value={form.config} onChange={(e) => setForm({ ...form, config: e.target.value })} className="font-mono text-xs" /></Field>
          {form.kind === "telegram" && <p className="text-xs text-ink-muted">Public channels only (they must have a web preview at t.me/s/name). Posts that look like ads, digests or job seekers are skipped.</p>}
          {(form.kind === "adzuna" || form.kind === "usajobs") && <p className="text-xs text-warning">Requires API keys in the server environment ({form.kind === "adzuna" ? "ADZUNA_APP_ID / ADZUNA_APP_KEY" : "USAJOBS_API_KEY / USAJOBS_EMAIL"}).</p>}
          <InlineError error={add.error} />
          <div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setAdding(false)}>Cancel</Button><Button loading={add.isPending} disabled={form.name.length < 2} onClick={() => add.mutate()}>Add source</Button></div>
        </div>
      </Modal>
    </div>
  );
}
