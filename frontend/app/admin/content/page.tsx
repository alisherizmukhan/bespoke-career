"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Plus, Trash2 } from "@/components/icons";
import { Button, Card, ErrorState, InlineError, Input, LoadingCards, PageHeader, Textarea } from "@/components/ui";
import { api } from "@/lib/api";
import { date } from "@/lib/format";

type Content = Record<string, any>;

function Section({ id, title, hint, updated, children, onSave, onReset, saving, error }: {
  id: string; title: string; hint: string; updated?: string; children: React.ReactNode; onSave: () => void; onReset: () => void; saving: boolean; error?: unknown;
}) {
  return (
    <Card id={id}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[17px] font-semibold">{title}</p>
          <p className="mt-0.5 text-sm text-ink-muted">{hint}</p>
        </div>
        <p className="text-xs text-ink-faint">{updated ? `Edited ${date(updated)}` : "Using default copy"}</p>
      </div>
      <div className="mt-5 space-y-4">{children}</div>
      <InlineError error={error} />
      <div className="mt-5 flex gap-2">
        <Button loading={saving} onClick={onSave}>Publish</Button>
        {updated && <Button variant="ghost" onClick={() => confirm("Go back to the default copy?") && onReset()}>Reset to default</Button>}
      </div>
    </Card>
  );
}

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <label className="block text-[13px] font-medium text-ink-muted">{label}<div className="mt-1">{children}</div></label>
);

export default function ContentAdmin() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["admin-content"], queryFn: () => api("/admin/content") });
  const [c, setC] = useState<Content | null>(null);
  useEffect(() => { if (q.data && !c) setC(structuredClone(q.data.content)); }, [q.data, c]);
  const save = useMutation({
    mutationFn: (key: string) => api(`/admin/content/${key}`, { method: "PUT", body: c![key] }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-content"] }); qc.invalidateQueries({ queryKey: ["content"] }); },
  });
  const reset = useMutation({
    mutationFn: (key: string) => api(`/admin/content/${key}`, { method: "DELETE" }),
    onSuccess: async (_r, key) => {
      const fresh = await qc.fetchQuery({ queryKey: ["admin-content"], queryFn: () => api("/admin/content") });
      setC((prev) => ({ ...prev!, [key]: structuredClone(fresh.content[key]) }));
      qc.invalidateQueries({ queryKey: ["content"] });
    },
  });
  if (q.isLoading || !c) return q.isError ? <ErrorState error={q.error} /> : <LoadingCards />;
  const set = (key: string, field: string, v: any) => setC({ ...c, [key]: { ...c[key], [field]: v } });
  const upd = q.data.updated || {};
  const common = (key: string) => ({ onSave: () => save.mutate(key), onReset: () => reset.mutate(key), saving: save.isPending && save.variables === key,
    error: save.variables === key ? save.error : undefined, updated: upd[key]?.at });
  const faq: { q: string; a: string }[] = c.pricing_faq.items || [];

  return (
    <div>
      <PageHeader title="Site content" subtitle="Edit the public copy. Changes go live as soon as you publish." />
      <div className="space-y-6">
        <Section id="announcement" title="Announcement bar" hint="A thin bar above the header on every public page. Use it for launches and offers." {...common("announcement")}>
          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" checked={!!c.announcement.active} onChange={(e) => set("announcement", "active", e.target.checked)} className="h-4 w-4 accent-violet-600" />Show the bar
          </label>
          <Field label="Text"><Input value={c.announcement.text} onChange={(e) => set("announcement", "text", e.target.value)} placeholder="Yearly plans are now 38% less than monthly" maxLength={140} /></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Link (optional)"><Input value={c.announcement.link} onChange={(e) => set("announcement", "link", e.target.value)} placeholder="/pricing" /></Field>
            <Field label="Link label"><Input value={c.announcement.link_label} onChange={(e) => set("announcement", "link_label", e.target.value)} placeholder="See plans" /></Field>
          </div>
          {c.announcement.active && c.announcement.text && (
            <div className="rounded-md bg-ink px-4 py-2 text-center text-[13px] text-white">{c.announcement.text}{c.announcement.link && <span className="ml-2 underline">{c.announcement.link_label || "Learn more"}</span>}</div>
          )}
        </Section>

        <Section id="hero" title="Landing hero" hint="The first thing visitors read on the home page." {...common("landing_hero")}>
          <Field label="Headline"><Input value={c.landing_hero.headline} onChange={(e) => set("landing_hero", "headline", e.target.value)} maxLength={90} /></Field>
          <Field label="Subheadline"><Textarea rows={3} value={c.landing_hero.subhead} onChange={(e) => set("landing_hero", "subhead", e.target.value)} maxLength={260} /></Field>
          <Field label="Button text"><Input value={c.landing_hero.cta} onChange={(e) => set("landing_hero", "cta", e.target.value)} maxLength={40} /></Field>
        </Section>

        <Section id="pricing" title="Pricing page" hint="Heading above the plans. Prices and limits are edited under Plans & limits." {...common("pricing")}>
          <Field label="Headline"><Input value={c.pricing.headline} onChange={(e) => set("pricing", "headline", e.target.value)} maxLength={90} /></Field>
          <Field label="Subheadline"><Textarea rows={3} value={c.pricing.subhead} onChange={(e) => set("pricing", "subhead", e.target.value)} maxLength={260} /></Field>
        </Section>

        <Section id="faq" title="Pricing FAQ" hint="Answer the questions people ask before paying." {...common("pricing_faq")}>
          {faq.map((item, i) => (
            <div key={i} className="rounded-md border border-line p-4">
              <div className="flex gap-2">
                <Input value={item.q} onChange={(e) => set("pricing_faq", "items", faq.map((x, j) => (j === i ? { ...x, q: e.target.value } : x)))} placeholder="Question" aria-label={`Question ${i + 1}`} />
                <Button variant="ghost" aria-label="Remove question" onClick={() => set("pricing_faq", "items", faq.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button>
              </div>
              <Textarea rows={2} className="mt-2" value={item.a} onChange={(e) => set("pricing_faq", "items", faq.map((x, j) => (j === i ? { ...x, a: e.target.value } : x)))} placeholder="Answer" aria-label={`Answer ${i + 1}`} />
            </div>
          ))}
          <Button variant="secondary" onClick={() => set("pricing_faq", "items", [...faq, { q: "", a: "" }])}><Plus className="h-4 w-4" />Add question</Button>
        </Section>
      </div>
    </div>
  );
}
