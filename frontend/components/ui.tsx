"use client";

import clsx from "clsx";
import { AlertCircle, ArrowUpRight, Inbox, Loader2, X } from "@/components/icons";
import Link from "next/link";
import { forwardRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { ApiError, api } from "@/lib/api";
import { RollingNumber } from "./motion";

export const cx = clsx;

type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "soft" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
  href?: string;
};

const btnBase = "inline-flex items-center justify-center gap-2 font-medium rounded-md transition-[background-color,border-color,color,transform] duration-150 ease-out active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap";
const btnVariant = {
  primary: "bg-accent text-white hover:bg-accent-ink",
  secondary: "bg-white text-ink border border-line hover:bg-lavender-50",
  soft: "bg-lavender-100 text-ink hover:bg-lavender-200",
  ghost: "text-ink-muted hover:text-ink hover:bg-lavender-100",
  danger: "bg-white text-danger border border-danger-soft hover:bg-danger-soft",
};
const btnSize = { sm: "h-8 px-3 text-small", md: "h-10 px-4 text-sm", lg: "h-12 px-5 text-body" };

export function Button({ variant = "primary", size = "md", loading, href, className, children, ...rest }: BtnProps) {
  const cls = cx(btnBase, btnVariant[variant], btnSize[size], className);
  if (href) return <Link href={href} className={cls}>{children}</Link>;
  return (
    <button className={cls} disabled={loading || rest.disabled} {...rest}>
      {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

export function Card({ className, children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cx("card p-5 sm:p-6", className)} {...rest}>{children}</div>;
}

const tones = {
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
  info: "bg-accent-soft text-accent-ink",
  neutral: "bg-line text-ink-muted",
};
export function Badge({ tone = "info", dot = true, children, className }: { tone?: keyof typeof tones; dot?: boolean; children: React.ReactNode; className?: string }) {
  return (
    <span className={cx("inline-flex items-center gap-1.5 rounded-sm px-2 py-0.5 text-xs font-medium", tones[tone], className)}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />}
      {children}
    </span>
  );
}

export const STATUS_TONE: Record<string, keyof typeof tones> = {
  interested: "neutral", preparing: "neutral", applied: "info", viewed: "info", screening: "info", interview: "warning",
  assessment: "warning", final_interview: "warning", offer: "success", hired: "success", rejected: "danger", withdrawn: "neutral", archived: "neutral",
};

export function Label({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) {
  return <label htmlFor={htmlFor} className="text-small font-medium text-ink">{children}</label>;
}

export function Field({ label, error, hint, children, id }: { label?: string; error?: string; hint?: string; children: React.ReactNode; id?: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && <Label htmlFor={id}>{label}</Label>}
      {children}
      {error ? <p className="flex items-center gap-1 text-xs font-medium text-danger"><AlertCircle className="h-3.5 w-3.5" />{error}</p>
        : hint ? <p className="text-xs text-ink-muted">{hint}</p> : null}
    </div>
  );
}

// Field border meets WCAG 1.4.11 (3:1 against white); focus swaps it for the accent plus a ring
const inputCls = "w-full min-h-[46px] rounded-md border border-field bg-white px-3.5 text-sm text-ink placeholder:text-ink-faint hover:border-ink-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25";
export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(
  ({ className, invalid, ...p }, ref) => <input ref={ref} className={cx(inputCls, invalid && "border-danger", className)} {...p} />
);
Input.displayName = "Input";
export const Textarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...p }, ref) => <textarea ref={ref} className={cx(inputCls, "py-3 min-h-[110px]", className)} {...p} />
);
Textarea.displayName = "Textarea";
export const Select = forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...p }, ref) => <select ref={ref} className={cx(inputCls, "pr-8", className)} {...p}>{children}</select>
);
Select.displayName = "Select";

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("skeleton", className)} />;
}

export function LoadingCards({ n = 3 }: { n?: number }) {
  return (
    <div className="grid gap-4">
      {Array.from({ length: n }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
    </div>
  );
}

export function EmptyState({ title, body, action, icon: Icon = Inbox }: { title: string; body?: string; action?: React.ReactNode; icon?: any }) {
  return (
    <div className="flex flex-col items-center rounded-lg border border-dashed border-violet-200 px-6 py-12 text-center">
      <Icon className="mb-3 h-6 w-6 text-ink-faint" />
      <p className="font-medium text-ink">{title}</p>
      {body && <p className="mt-1 max-w-md text-sm text-ink-muted">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, retry }: { error: unknown; retry?: () => void }) {
  const msg = error instanceof Error ? error.message : "Something went wrong.";
  return (
    <div className="flex items-start gap-3 rounded-lg border border-danger-soft bg-white p-4 text-sm">
      <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-danger" />
      <div className="flex-1">
        <p className="font-medium text-ink">We couldn't load this.</p>
        <p className="text-ink-muted">{msg}</p>
      </div>
      {retry && <Button size="sm" variant="secondary" onClick={retry}>Try again</Button>}
    </div>
  );
}

export function UpgradeNotice({ error }: { error: unknown }) {
  const is402 = error instanceof ApiError && error.status === 402;
  const plans = useQuery({ queryKey: ["plans"], queryFn: () => api("/billing/plans"), enabled: is402, staleTime: 600_000 });
  if (!is402) return null;
  const pro = plans.data?.plans?.find((p: any) => p.slug === "pro");
  const perMonth = pro ? pro.price_year / 12 : null;
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-accent/40 bg-accent-soft p-4 sm:flex-row sm:items-center">
      <ArrowUpRight className="h-5 w-5 shrink-0 text-accent-ink" />
      <div className="flex-1">
        <p className="text-sm font-medium text-ink">{(error as ApiError).message}</p>
        {perMonth !== null && <p className="mt-0.5 text-small text-ink-muted">Career Pro lifts this limit from ${Number.isInteger(perMonth) ? perMonth : perMonth.toFixed(2)}/mo billed yearly. Cancel anytime.</p>}
      </div>
      <Button size="sm" href="/app/billing?plan=pro&interval=year">Upgrade to Pro</Button>
    </div>
  );
}

export function InlineError({ error }: { error: unknown }) {
  if (!error) return null;
  if (error instanceof ApiError && error.status === 402) return <UpgradeNotice error={error} />;
  return (
    <p className="flex items-start gap-2 rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
      {error instanceof Error ? error.message : String(error)}
    </p>
  );
}

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", k);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/30 p-0 sm:items-center sm:p-6" onClick={onClose} role="dialog" aria-modal="true" aria-label={title}>
      <div className={cx("max-h-[92vh] w-full overflow-y-auto rounded-t-xl bg-white p-5 shadow-pop sm:rounded-lg sm:p-6", wide ? "sm:max-w-3xl" : "sm:max-w-lg")} onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 className="text-lg font-medium text-ink">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="rounded-md p-1 text-ink-muted hover:bg-lavender-100"><X className="h-5 w-5" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Tabs<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: { value: T; label: string; icon?: any }[] }) {
  return (
    <div className="inline-flex flex-wrap gap-1 rounded-md border border-line bg-white p-1" role="tablist">
      {items.map((it) => (
        <button key={it.value} role="tab" aria-selected={value === it.value} onClick={() => onChange(it.value)}
          className={cx("inline-flex items-center gap-1.5 rounded-sm px-3 py-1.5 text-small font-medium transition-colors duration-150",
            value === it.value ? "bg-lavender-100 text-ink shadow-[inset_0_0_0_1px_rgba(28,26,23,0.08)]" : "text-ink-muted hover:text-ink")}>
          {it.icon && <it.icon className="h-4 w-4" />}{it.label}
        </button>
      ))}
    </div>
  );
}

export function IconTile({ icon: Icon }: { icon: any; tone?: string }) {
  return <Icon className="h-[18px] w-[18px] shrink-0 text-ink-faint" />;
}

/** Stat cards are numbers: a label, a figure and what it compares to. The icon prop is accepted but not drawn. */
export function StatCard({ label, value, sub }: { icon?: any; label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: any }) {
  return (
    <div className="card p-4 sm:p-5">
      <p className="text-small text-ink-muted">{label}</p>
      <p className="tabular mt-2 text-[24px] font-medium leading-none tracking-[-0.01em] text-ink sm:text-h3">{typeof value === "number" ? <RollingNumber value={value} countUp /> : value}</p>
      {sub && <p className="mt-2 text-small text-ink-faint">{sub}</p>}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="h-display text-h2 leading-[1.1] sm:text-h1">{title}</h1>
        {subtitle && <p className="mt-1 text-body text-ink-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function ScoreRing({ score, size = 96, label }: { score: number; size?: number; label?: string }) {
  const r = (size - 10) / 2;
  const c = 2 * Math.PI * r;
  const tone = score >= 75 ? "stroke-success" : score >= 55 ? "stroke-accent" : "stroke-warning";
  return (
    <div className="relative inline-grid place-items-center" style={{ width: size, height: size }} role="img" aria-label={`${label || "Score"} ${score} out of 100`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} className="stroke-line" strokeWidth="6" fill="none" />
        <circle cx={size / 2} cy={size / 2} r={r} className={tone} strokeWidth="6" fill="none" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - score / 100)} />
      </svg>
      <span className="absolute text-center">
        <span className="tabular block text-2xl font-medium text-ink">{score}</span>
        {label && <span className="block text-xs font-medium text-ink-muted">{label}</span>}
      </span>
    </div>
  );
}

/** Wordmark in the interface family plus a flat ink mark: an open folio with a single fold line. */
export function Logo({ className, light }: { className?: string; light?: boolean }) {
  return (
    <Link href="/" className={cx("inline-flex items-center gap-2", className)} aria-label="Bespoke home">
      <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden>
        <rect x="1" y="1" width="20" height="20" rx="5" className={light ? "fill-night-text" : "fill-ink"} />
        <path d="M7 6.5h5.2a2.6 2.6 0 0 1 0 5.2H7m0 0h5.8a2.9 2.9 0 0 1 0 5.8H7V6.5" fill="none" className={light ? "stroke-night-900" : "stroke-lavender-50"} strokeWidth="1.8" strokeLinejoin="round" />
      </svg>
      <span className={cx("text-lg font-medium tracking-[-0.01em]", light ? "text-night-text" : "text-ink")}>bespoke</span>
    </Link>
  );
}

/** Signature: the percentile marker. A thin tick on a range with a small "You" label. */
export function RangeMarker({ left, label = "You", dark }: { left: string; label?: string; dark?: boolean }) {
  return (
    <span className="absolute -top-6 flex -translate-x-1/2 flex-col items-center" style={{ left }} aria-label={`${label} marker`}>
      <span className={cx("font-mono text-xs leading-4", dark ? "text-night-text" : "text-ink")}>{label}</span>
      <span className={cx("mt-0.5 h-5 w-px", dark ? "bg-night-text" : "bg-ink")} />
    </span>
  );
}
