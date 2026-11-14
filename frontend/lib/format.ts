export const money = (v?: number | null, opts: { compact?: boolean } = {}) => {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  if (opts.compact && Math.abs(v) >= 1000) return `$${Math.round(v / 1000)}k`;
  return v.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
};

const PERIOD: Record<string, string> = { hour: "/hr", week: "/wk", day: "/day", month: "/mo", year: "/yr" };

export function salaryLabel(j: { salary_min?: number | null; salary_max?: number | null; salary_period?: string | null; currency?: string | null }) {
  if (!j.salary_min && !j.salary_max) return null;
  const cur = j.currency && j.currency !== "USD" ? `${j.currency} ` : "";
  const hourly = j.salary_period === "hour";
  const f = (n: number) => (hourly ? `$${n.toFixed(n % 1 ? 2 : 0)}` : n >= 1000 ? `$${Math.round(n / 1000)}k` : `$${n}`);
  const range = j.salary_min && j.salary_max && j.salary_max !== j.salary_min ? `${f(j.salary_min)}–${f(j.salary_max)}` : f((j.salary_min || j.salary_max)!);
  return `${cur}${range}${PERIOD[j.salary_period || "year"] || ""}`;
}

export function date(v?: string | null, withTime = false) {
  if (!v) return "—";
  const d = new Date(v);
  return d.toLocaleString("en-US", withTime ? { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" } : { month: "short", day: "numeric", year: "numeric" });
}

export function ago(v?: string | null) {
  if (!v) return "";
  const s = (Date.now() - new Date(v).getTime()) / 1000;
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  const d = Math.round(s / 86400);
  return d === 1 ? "yesterday" : d < 30 ? `${d} days ago` : date(v);
}

export const titleCase = (s?: string | null) => (s || "").replace(/[_-]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
