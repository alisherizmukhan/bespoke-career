"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Card, ErrorState, Input, LoadingCards, PageHeader } from "@/components/ui";
import { api } from "@/lib/api";
import { date } from "@/lib/format";

export default function Audit() {
  const [action, setAction] = useState("");
  const q = useQuery({ queryKey: ["audit", action], queryFn: () => api(`/admin/audit-logs?action=${encodeURIComponent(action)}`) });
  return (
    <div>
      <PageHeader title="Audit log" subtitle="Append-only record of logins, admin actions, billing and data changes." />
      <Input value={action} onChange={(e) => setAction(e.target.value)} placeholder="Filter by action prefix, e.g. admin. or auth." className="mb-4 max-w-sm" aria-label="Filter" />
      {q.isLoading ? <LoadingCards /> : q.isError ? <ErrorState error={q.error} /> : (
        <Card className="!p-0 overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="border-b border-line bg-lavender-50 text-left text-[13px] text-ink-muted"><tr>{["When", "Actor", "Action", "Entity", "Details", "IP"].map((h) => <th key={h} className="px-4 py-3 font-semibold">{h}</th>)}</tr></thead>
            <tbody>{q.data.map((l: any) => (
              <tr key={l.id} className="border-b border-line align-top last:border-0">
                <td className="whitespace-nowrap px-4 py-2.5 text-ink-muted">{date(l.created_at, true)}</td><td className="px-4 py-2.5">{l.actor}</td>
                <td className="px-4 py-2.5 font-medium">{l.action}</td><td className="px-4 py-2.5 text-ink-muted">{l.entity_type || ""}</td>
                <td className="max-w-[280px] truncate px-4 py-2.5 font-mono text-xs text-ink-muted" title={JSON.stringify(l.details)}>{JSON.stringify(l.details)}</td><td className="px-4 py-2.5 text-ink-muted">{l.ip || ""}</td>
              </tr>
            ))}</tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
