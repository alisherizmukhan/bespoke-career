"use client";

import { X } from "@/components/icons";
import { useState } from "react";
import { cx } from "./ui";

export function ChipsInput({ value, onChange, placeholder, suggestions = [] }: { value: string[]; onChange: (v: string[]) => void; placeholder?: string; suggestions?: string[] }) {
  const [text, setText] = useState("");
  const add = (raw: string) => {
    const parts = raw.split(",").map((s) => s.trim()).filter(Boolean);
    const next = [...value];
    for (const p of parts) if (!next.some((v) => v.toLowerCase() === p.toLowerCase())) next.push(p);
    onChange(next.slice(0, 40));
    setText("");
  };
  return (
    <div>
      <div className="flex min-h-[46px] flex-wrap items-center gap-1.5 rounded-md border border-field bg-white px-2 py-1.5 focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/25">
        {value.map((v) => (
          <span key={v} className="inline-flex items-center gap-1 rounded-full bg-violet-100 py-1 pl-2.5 pr-1 text-small font-medium text-violet-700">
            {v}
            <button type="button" onClick={() => onChange(value.filter((x) => x !== v))} className="grid h-6 w-6 place-items-center rounded-full hover:bg-violet-200" aria-label={`Remove ${v}`}><X className="h-3.5 w-3.5" /></button>
          </span>
        ))}
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder={value.length ? "" : placeholder}
          onKeyDown={(e) => { if ((e.key === "Enter" || e.key === ",") && text.trim()) { e.preventDefault(); add(text); } if (e.key === "Backspace" && !text && value.length) onChange(value.slice(0, -1)); }}
          onBlur={() => text.trim() && add(text)} className="min-w-[140px] flex-1 border-0 bg-transparent px-1 py-1 text-sm focus:outline-none" />
      </div>
      {suggestions.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {suggestions.filter((s) => !value.includes(s)).slice(0, 10).map((s) => (
            <button key={s} type="button" onClick={() => add(s)} className="rounded-full border border-dashed border-violet-300 px-2.5 py-1 text-xs font-medium text-violet-700 hover:bg-violet-100">+ {s}</button>
          ))}
        </div>
      )}
    </div>
  );
}

export function ToggleGroup({ options, value, onChange, multi }: { options: { value: string; label: string }[]; value: string | string[]; onChange: (v: any) => void; multi?: boolean }) {
  const arr = Array.isArray(value) ? value : [value];
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const on = arr.includes(o.value);
        return (
          <button key={o.value} type="button" aria-pressed={on}
            onClick={() => (multi ? onChange(on ? arr.filter((x) => x !== o.value) : [...arr, o.value]) : onChange(o.value))}
            className={cx("rounded-md border px-3.5 py-2 text-sm font-medium transition-colors", on ? "border-violet-600 bg-violet-100 text-violet-700" : "border-violet-200 bg-white text-ink-muted hover:border-violet-400")}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export const INDUSTRIES = [
  ["technology", "Technology & Engineering"], ["healthcare", "Healthcare & Medicine"], ["academia", "Academia & Education"],
  ["business", "Business & Management"], ["finance", "Finance & Accounting"], ["marketing", "Marketing & Communications"],
  ["creative", "Creative & Design"], ["media", "Media & Entertainment"], ["legal", "Legal"], ["science", "Science & Research"],
  ["architecture", "Architecture & Construction"], ["sales", "Sales & Customer Success"], ["hr", "Human Resources"],
  ["operations", "Operations & Logistics"], ["hospitality", "Hospitality & Tourism"], ["public", "Public Sector & Nonprofit"],
  ["trades", "Skilled Trades"], ["agriculture", "Agriculture & Environment"],
];
export const PROFILE_TYPES = [
  { value: "professional", label: "Professional" }, { value: "career_changer", label: "Career changer" },
  { value: "recent_graduate", label: "Recent graduate" }, { value: "student", label: "Student" }, { value: "high_school", label: "High school student" },
];
export const SENIORITY = [
  { value: "intern", label: "Intern" }, { value: "entry", label: "Entry" }, { value: "mid", label: "Mid" },
  { value: "senior", label: "Senior" }, { value: "lead", label: "Lead / Manager" }, { value: "executive", label: "Executive" },
];
