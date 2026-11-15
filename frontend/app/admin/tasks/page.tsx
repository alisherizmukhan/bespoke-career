"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { ExportButtons } from "@/components/admin-tools";
import { Check } from "@/components/icons";
import { EmptyState, ErrorState, LoadingCards, PageHeader, Tabs, cx } from "@/components/ui";
import { api } from "@/lib/api";
import { date } from "@/lib/format";

export default function Tasks() {
  const qc = useQueryClient();
  const [status, setStatus] = useState<"open" | "done" | "all">("open");
  const t = useQuery({ queryKey: ["crm-tasks", status], queryFn: () => api(`/admin/crm/tasks?status=${status}`) });
  const toggle = useMutation({
    mutationFn: (n: any) => api(`/admin/crm/notes/${n.id}`, { method: "PATCH", body: { done: !n.done } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["crm-tasks"] }); qc.invalidateQueries({ queryKey: ["crm-overview"] }); },
  });
  const now = new Date();
  return (
    <div>
      <PageHeader title="Tasks" subtitle="Follow-ups you've set on customers, soonest first." actions={<ExportButtons dataset="notes" />} />
      <div className="mb-4"><Tabs value={status} onChange={setStatus} items={[{ value: "open", label: "Open" }, { value: "done", label: "Done" }, { value: "all", label: "All" }]} /></div>
      {t.isLoading ? <LoadingCards /> : t.isError ? <ErrorState error={t.error} /> : !t.data.length ? (
        <EmptyState title="No tasks here" body="Add a task from any customer's page in the CRM." />
      ) : (
        <div className="divide-y divide-line rounded-lg border border-line bg-white">
          {t.data.map((n: any) => {
            const overdue = !n.done && n.due_at && new Date(n.due_at) < now;
            return (
              <div key={n.id} className="flex items-start gap-3 px-5 py-4">
                <button type="button" aria-label={n.done ? "Mark open" : "Mark done"} onClick={() => toggle.mutate(n)}
                  className={cx("mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded border", n.done ? "border-ink bg-ink text-white" : "border-field")}>{n.done && <Check className="h-4 w-4" />}</button>
                <div className="min-w-0 flex-1">
                  <p className={cx("text-sm", n.done && "text-ink-muted line-through")}>{n.body}</p>
                  <p className="mt-1 text-xs text-ink-muted">
                    <Link href={`/admin/crm/${n.user_id}`} className="font-medium text-ink hover:underline">{n.customer_email}</Link> · by {n.author}
                  </p>
                </div>
                <span className={cx("shrink-0 text-small", overdue ? "font-medium text-danger" : "text-ink-muted")}>{n.due_at ? `${overdue ? "Overdue · " : ""}${date(n.due_at)}` : "No due date"}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
