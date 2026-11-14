"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Badge, Button, Card, ErrorState, InlineError, Input, LoadingCards, PageHeader, Select } from "@/components/ui";
import { api } from "@/lib/api";
import { date } from "@/lib/format";

export default function Users() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const users = useQuery({ queryKey: ["admin-users", q, status], queryFn: () => api(`/admin/users?q=${encodeURIComponent(q)}&status=${status}`) });
  const act = useMutation({ mutationFn: ({ id, action, plan }: any) => api(`/admin/users/${id}`, { method: "PATCH", body: { action, plan } }), onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-users"] }) });
  return (
    <div>
      <PageHeader title="Users" subtitle="Search accounts, change plans, suspend or restore access. Every action is audited." />
      <div className="mb-4 flex flex-wrap gap-2">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by email or name" className="max-w-xs" aria-label="Search" />
        <Select value={status} onChange={(e) => setStatus(e.target.value)} className="max-w-[180px]" aria-label="Status"><option value="">All statuses</option><option value="active">Active</option><option value="suspended">Suspended</option><option value="deleted">Deleted</option></Select>
      </div>
      <InlineError error={act.error} />
      {users.isLoading ? <LoadingCards /> : users.isError ? <ErrorState error={users.error} /> : (
        <Card className="!p-0 overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead className="border-b border-line bg-lavender-50 text-left text-[13px] text-ink-muted"><tr>{["User", "Type", "Plan", "Status", "Joined", "Last login", "Actions"].map((h) => <th key={h} className="px-4 py-3 font-medium">{h}</th>)}</tr></thead>
            <tbody>{users.data.map((u: any) => (
              <tr key={u.id} className="border-b border-line last:border-0">
                <td className="px-4 py-3"><p className="font-medium">{u.full_name || "—"}{u.role === "admin" && <Badge tone="info" className="ml-2">Admin</Badge>}</p><p className="text-xs text-ink-muted">{u.email}</p></td>
                <td className="px-4 py-3 capitalize text-ink-muted">{(u.profile_type || "—").replace("_", " ")}</td>
                <td className="px-4 py-3">
                  <Select value={u.plan} onChange={(e) => act.mutate({ id: u.id, action: "grant_plan", plan: e.target.value })} className="!min-h-[34px] w-[120px] py-1 text-xs" aria-label="Plan">
                    {["free", "plus", "pro", "family"].map((p) => <option key={p} value={p}>{p}</option>)}
                  </Select>
                </td>
                <td className="px-4 py-3">{u.status === "active" ? <Badge tone="success">Active</Badge> : u.status === "suspended" ? <Badge tone="danger">Suspended</Badge> : <Badge tone="neutral">{u.status}</Badge>}</td>
                <td className="px-4 py-3 text-ink-muted">{date(u.created_at)}</td>
                <td className="px-4 py-3 text-ink-muted">{u.last_login_at ? date(u.last_login_at) : "—"}</td>
                <td className="px-4 py-3">{u.status === "active" ? <Button size="sm" variant="danger" onClick={() => confirm(`Suspend ${u.email}?`) && act.mutate({ id: u.id, action: "suspend" })}>Suspend</Button> : u.status === "suspended" ? <Button size="sm" variant="secondary" onClick={() => act.mutate({ id: u.id, action: "restore" })}>Restore</Button> : null}</td>
              </tr>
            ))}</tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
