"use client";

import { useQuery } from "@tanstack/react-query";
import { Badge, Card, ErrorState, PageHeader, Skeleton } from "@/components/ui";
import { api } from "@/lib/api";

export default function AiUsage() {
  const q = useQuery({ queryKey: ["ai-usage"], queryFn: () => api("/admin/ai-usage?days=30") });
  if (q.isLoading) return <Skeleton className="h-64" />;
  if (q.isError) return <ErrorState error={q.error} />;
  const d = q.data;
  return (
    <div>
      <PageHeader title="AI usage" subtitle="Last 30 days. Only metadata is logged — never prompts or answers." />
      <Card className="mb-5 flex flex-wrap items-center gap-3">
        <span className="text-sm text-ink-muted">Provider</span><b className="capitalize">{d.provider}</b>
        <span className="text-sm text-ink-muted">Smart model</span><b>{d.model}</b>
        {d.enabled ? <Badge tone="success">Enabled</Badge> : <Badge tone="warning">No API key — rule-based fallback</Badge>}
      </Card>
      <Card className="!p-0 overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="border-b border-line bg-lavender-50 text-left text-[13px] text-ink-muted"><tr>{["Task", "Status", "Calls", "Input tokens", "Output tokens", "Avg latency"].map((h) => <th key={h} className="px-4 py-3 font-medium">{h}</th>)}</tr></thead>
          <tbody>{d.rows.length ? d.rows.map((r: any) => (
            <tr key={r.task + r.status} className="border-b border-line last:border-0"><td className="px-4 py-3 font-medium">{r.task}</td><td className="px-4 py-3"><Badge tone={r.status === "ok" ? "success" : r.status === "refused" ? "warning" : "danger"}>{r.status}</Badge></td><td className="tabular px-4 py-3">{r.calls}</td><td className="tabular px-4 py-3">{r.input_tokens.toLocaleString("en-US")}</td><td className="tabular px-4 py-3">{r.output_tokens.toLocaleString("en-US")}</td><td className="tabular px-4 py-3">{(r.avg_latency_ms / 1000).toFixed(1)}s</td></tr>
          )) : <tr><td className="px-4 py-6 text-ink-muted" colSpan={6}>No AI calls yet.</td></tr>}</tbody>
        </table>
      </Card>
    </div>
  );
}
