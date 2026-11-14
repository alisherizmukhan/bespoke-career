"use client";

import { ExportButtons } from "@/components/admin-tools";
import { PageHeader } from "@/components/ui";

const DATASETS: [string, string, string][] = [
  ["customers", "Customers", "One row per account: stage, plan, MRR, lifetime revenue, activity, tags and follow-ups"],
  ["payments", "Payments", "Every charge with amount, status and customer"],
  ["subscriptions", "Subscriptions", "Plan, billing interval, period and cancellation status, including past ones"],
  ["applications", "Applications", "Job applications customers track, with status"],
  ["notes", "CRM notes and tasks", "Notes, logged calls and emails, and tasks with due dates"],
  ["jobs", "Jobs", "The job board: title, company, location, pay, source and visibility (up to 50,000 rows)"],
  ["plans", "Plans", "Prices, limits and features for every plan"],
  ["ai_calls", "AI usage", "Model, task, tokens and latency for each AI request; no prompts or answers"],
  ["audit_logs", "Audit log", "Every admin and account action with time, actor and IP"],
];

export default function Exports() {
  return (
    <div>
      <PageHeader title="Exports" subtitle="Download any table as an Excel workbook or a CSV file. Every export is recorded in the audit log." />
      <div className="divide-y divide-line rounded-lg border border-line bg-white">
        {DATASETS.map(([key, title, body]) => (
          <div key={key} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center">
            <div className="flex-1">
              <p className="font-medium">{title}</p>
              <p className="text-sm text-ink-muted">{body}</p>
            </div>
            <ExportButtons dataset={key} />
          </div>
        ))}
      </div>
      <p className="mt-4 text-[13px] text-ink-muted">Exports contain personal data. Store them securely and delete them when you're done.</p>
    </div>
  );
}
