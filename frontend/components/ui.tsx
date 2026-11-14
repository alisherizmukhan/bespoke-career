"use client";

import clsx from "clsx";
import { AlertCircle, Inbox, Loader2, Sparkles, X } from "lucide-react";
import Link from "next/link";
import { forwardRef, useEffect } from "react";
import { ApiError } from "@/lib/api";

export const cx = clsx;

type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "soft" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
  href?: string;
};

const btnBase = "inline-flex items-center justify-center gap-2 font-semibold rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap";
const btnVariant = {
  primary: "bg-violet-600 text-white hover:bg-violet-700",
  secondary: "bg-white text-violet-700 border border-violet-200 hover:border-violet-400",
  soft: "bg-violet-100 text-violet-700 hover:bg-violet-200",
  ghost: "text-ink-muted hover:text-ink hover:bg-lavender-100",
  danger: "bg-white text-danger border border-danger-soft hover:bg-danger-soft",
};
const btnSize = { sm: "h-9 px-3 text-[13px]", md: "h-11 px-5 text-sm", lg: "h-12 px-6 text-[15px]" };

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
  info: "bg-violet-100 text-violet-700",
  neutral: "bg-line text-ink-muted",
};
export function Badge({ tone = "info", dot = true, children, className }: { tone?: keyof typeof tones; dot?: boolean; children: React.ReactNode; className?: string }) {
  return (
    <span className={cx("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold", tones[tone], className)}>
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
  return <label htmlFor={htmlFor} className="text-[13px] font-semibold text-ink">{children}</label>;
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

const inputCls = "w-full min-h-[46px] rounded-md border border-violet-200 bg-white px-3.5 text-sm text-ink placeholder:text-ink-muted/70 focus:border-violet-600 focus:outline-none focus:ring-2 focus:ring-violet-100";
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
    <div className="flex flex-col items-center rounded-lg bg-lavender-100 px-6 py-12 text-center">
      <span className="mb-3 grid h-12 w-12 place-items-center rounded-full bg-white text-violet-600"><Icon className="h-6 w-6" /></span>
      <p className="font-semibold text-ink">{title}</p>
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
        <p className="font-semibold text-ink">We couldn't load this.</p>
        <p className="text-ink-muted">{msg}</p>
      </div>
      {retry && <Button size="sm" variant="secondary" onClick={retry}>Try again</Button>}
    </div>
  );
}

export function UpgradeNotice({ error }: { error: unknown }) {
  if (!(error instanceof ApiError) || error.status !== 402) return null;
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-violet-200 bg-violet-100 p-4 sm:flex-row sm:items-center">
      <Sparkles className="h-5 w-5 shrink-0 text-violet-700" />
      <p className="flex-1 text-sm text-violet-900">{error.message}</p>
      <Button size="sm" href="/app/billing">See plans</Button>
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
          <h2 className="text-lg font-semibold text-ink">{title}</h2>
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
          className={cx("inline-flex items-center gap-1.5 rounded-sm px-3 py-1.5 text-[13px] font-semibold transition-colors",
            value === it.value ? "bg-violet-600 text-white" : "text-ink-muted hover:bg-lavender-100 hover:text-ink")}>
          {it.icon && <it.icon className="h-4 w-4" />}{it.label}
        </button>
      ))}
    </div>
  );
}

export function IconTile({ icon: Icon, tone = "violet" }: { icon: any; tone?: "violet" | "success" | "warning" | "danger" }) {
  const t = { violet: "bg-violet-100 text-violet-600", success: "bg-success-soft text-success", warning: "bg-warning-soft text-warning", danger: "bg-danger-soft text-danger" }[tone];
  return <span className={cx("grid h-11 w-11 shrink-0 place-items-center rounded-md", t)}><Icon className="h-5 w-5" strokeWidth={1.8} /></span>;
}

export function StatCard({ icon, label, value, sub, tone }: { icon: any; label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: any }) {
  return (
    <div className="card flex items-start gap-3.5 p-5">
      <IconTile icon={icon} tone={tone} />
      <div className="min-w-0">
        <p className="text-[13px] font-medium text-ink-muted">{label}</p>
        <p className="tabular text-[26px] font-bold leading-tight tracking-tight text-ink">{value}</p>
        {sub && <p className="text-[13px] text-ink-muted">{sub}</p>}
      </div>
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="h-display text-[28px] leading-tight sm:text-[32px]">{title}</h1>
        {subtitle && <p className="mt-1 text-[15px] text-ink-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function ScoreRing({ score, size = 96, label }: { score: number; size?: number; label?: string }) {
  const r = (size - 10) / 2;
  const c = 2 * Math.PI * r;
  const tone = score >= 75 ? "#24663F" : score >= 55 ? "#6C47D9" : "#8A5300";
  return (
    <div className="relative inline-grid place-items-center" style={{ width: size, height: size }} role="img" aria-label={`${label || "Score"} ${score} out of 100`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="#EBE4FD" strokeWidth="8" fill="none" />
        <circle cx={size / 2} cy={size / 2} r={r} stroke={tone} strokeWidth="8" fill="none" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - score / 100)} />
      </svg>
      <span className="absolute text-center">
        <span className="tabular block text-2xl font-bold text-ink">{score}</span>
        {label && <span className="block text-[11px] font-medium text-ink-muted">{label}</span>}
      </span>
    </div>
  );
}

export function Logo({ className, light }: { className?: string; light?: boolean }) {
  return (
    <Link href="/" className={cx("inline-flex items-center gap-2.5", className)} aria-label="Bespoke home">
      <svg width="34" height="34" viewBox="0 0 34 34" aria-hidden>
        <rect width="34" height="34" rx="10" fill={light ? "#fff" : "#6C47D9"} />
        <path d="M11 24.5V9.5h6.6c3.2 0 5 1.6 5 4 0 1.6-.9 2.7-2.2 3.2 1.7.4 2.9 1.7 2.9 3.6 0 2.6-2 4.2-5.4 4.2H11Z" fill={light ? "#6C47D9" : "#fff"} />
        <circle cx="25.5" cy="8.5" r="2.5" fill="#C9B8F7" />
      </svg>
      <span className={cx("font-display text-[21px] font-extrabold tracking-[-0.03em]", light ? "text-white" : "text-ink")}>
        Bespoke
      </span>
    </Link>
  );
}

export function Sparkle({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden>
      <path d="M12 2c.6 4.7 2.3 6.4 7 7-4.7.6-6.4 2.3-7 7-.6-4.7-2.3-6.4-7-7 4.7-.6 6.4-2.3 7-7Z" strokeLinejoin="round" />
    </svg>
  );
}
