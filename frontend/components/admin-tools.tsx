"use client";

import { useState } from "react";
import { Download } from "./icons";
import { Button, cx } from "./ui";
import { API_URL, ApiError, getToken } from "@/lib/api";

/** Download an admin export with the session token and save it under the server's filename. */
export async function downloadExport(dataset: string, format: "csv" | "xlsx") {
  const res = await fetch(`${API_URL}/api/v1/admin/export/${dataset}?format=${format}`, { headers: { Authorization: `Bearer ${getToken()}` } });
  if (!res.ok) throw new ApiError(res.status, "Export failed. Try again.");
  const name = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") || "")?.[1] || `bespoke-${dataset}.${format}`;
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function ExportButtons({ dataset, size = "sm" }: { dataset: string; size?: "sm" | "md" }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const run = async (f: "csv" | "xlsx") => {
    setBusy(f);
    setErr(null);
    try { await downloadExport(dataset, f); } catch (e: any) { setErr(e.message); } finally { setBusy(null); }
  };
  return (
    <div className="flex items-center gap-2">
      <Button size={size} variant="secondary" loading={busy === "xlsx"} onClick={() => run("xlsx")}><Download className="h-4 w-4" />Excel</Button>
      <Button size={size} variant="secondary" loading={busy === "csv"} onClick={() => run("csv")}><Download className="h-4 w-4" />CSV</Button>
      {err && <span className="text-xs text-danger">{err}</span>}
    </div>
  );
}

export function Stat({ label, value, sub, className }: { label: string; value: React.ReactNode; sub?: React.ReactNode; className?: string }) {
  return (
    <div className={cx("rounded-lg border border-line bg-white p-5", className)}>
      <p className="text-[13px] text-ink-muted">{label}</p>
      <p className="tabular mt-2 text-[28px] font-semibold leading-none tracking-[-0.02em]">{value}</p>
      {sub && <p className="mt-2 text-[13px] text-ink-muted">{sub}</p>}
    </div>
  );
}

export const STAGE_TONE: Record<string, string> = {
  new: "bg-lavender-100 text-ink",
  activated: "bg-accent-soft text-accent-ink",
  paying: "bg-success-soft text-success",
  vip: "bg-ink text-white",
  churning: "bg-warning-soft text-warning",
  churned: "bg-danger-soft text-danger",
  inactive: "bg-lavender-100 text-ink-muted",
  blocked: "bg-danger-soft text-danger",
};

export const STAGE_LABEL: Record<string, string> = {
  new: "New signup", activated: "Activated", paying: "Paying", churning: "Cancelling", churned: "Churned",
  inactive: "Inactive", vip: "VIP", blocked: "Blocked",
};

export function StagePill({ stage, manual }: { stage: string; manual?: boolean }) {
  return (
    <span className={cx("inline-flex items-center gap-1 rounded-sm px-2 py-0.5 text-xs font-medium", STAGE_TONE[stage] || "bg-lavender-100")}>
      {STAGE_LABEL[stage] || stage}{manual && <span title="Set by hand" className="opacity-60">·</span>}
    </span>
  );
}

export const usd0 = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: n % 1 ? 2 : 0 });
