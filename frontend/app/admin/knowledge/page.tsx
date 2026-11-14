"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "@/components/icons";
import { useState } from "react";
import { Badge, Button, Card, ErrorState, Field, InlineError, Input, LoadingCards, Modal, PageHeader, Select, Textarea } from "@/components/ui";
import { api } from "@/lib/api";
import { date } from "@/lib/format";

const EMPTY = { category: "best_practice", text: "", industry_slug: "", document_type: "", source_url: "", confidence: "medium", is_verified: false };

export default function Knowledge() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["guidelines"], queryFn: () => api("/admin/knowledge/guidelines") });
  const types = useQuery({ queryKey: ["doc-types"], queryFn: () => api("/resume-intelligence/document-types") });
  const [edit, setEdit] = useState<any>(null);
  const save = useMutation({
    mutationFn: () => { const b = { ...edit, industry_slug: edit.industry_slug || null, document_type: edit.document_type || null, source_url: edit.source_url || null }; return edit.id ? api(`/admin/knowledge/guidelines/${edit.id}`, { method: "PATCH", body: b }) : api("/admin/knowledge/guidelines", { body: b }); },
    onSuccess: () => { setEdit(null); qc.invalidateQueries({ queryKey: ["guidelines"] }); },
  });
  const tone: any = { legal: "danger", employer: "warning", association: "info", convention: "neutral", best_practice: "success" };
  return (
    <div>
      <PageHeader title="Knowledge base" subtitle="Resume guidelines by industry and document type. Each record is versioned with its source, confidence and last verification date."
        actions={<Button onClick={() => setEdit({ ...EMPTY })}><Plus className="h-4 w-4" />Add guideline</Button>} />
      {q.isLoading ? <LoadingCards /> : q.isError ? <ErrorState error={q.error} /> : (
        <div className="space-y-3">{q.data.map((g: any) => (
          <Card key={g.id} className="flex cursor-pointer flex-col gap-2 !p-4 hover:border-violet-300" onClick={() => setEdit(g)}>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={tone[g.category]}>{g.category.replace("_", " ")}</Badge>
              {g.industry_slug && <Badge tone="neutral" dot={false}>{g.industry_slug}</Badge>}
              {g.document_type && <Badge tone="neutral" dot={false}>{g.document_type}</Badge>}
              <span className="ml-auto text-xs text-ink-muted">v{g.version} · {g.is_verified ? `verified ${date(g.last_verified)}` : "unverified"} · {g.confidence} confidence</span>
            </div>
            <p className="text-sm">{g.text}</p>
            {g.source_url && <a href={g.source_url} onClick={(e) => e.stopPropagation()} target="_blank" rel="noopener noreferrer" className="link truncate text-xs">{g.source_url}</a>}
          </Card>
        ))}</div>
      )}
      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? "Edit guideline" : "New guideline"}>
        {edit && (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Category" id="cat"><Select id="cat" value={edit.category} onChange={(e) => setEdit({ ...edit, category: e.target.value })}>{["legal", "employer", "association", "convention", "best_practice"].map((c) => <option key={c} value={c}>{c.replace("_", " ")}</option>)}</Select></Field>
              <Field label="Confidence" id="cf"><Select id="cf" value={edit.confidence} onChange={(e) => setEdit({ ...edit, confidence: e.target.value })}>{["low", "medium", "high"].map((c) => <option key={c}>{c}</option>)}</Select></Field>
              <Field label="Industry" id="in"><Select id="in" value={edit.industry_slug || ""} onChange={(e) => setEdit({ ...edit, industry_slug: e.target.value })}><option value="">All</option>{(types.data?.industries || []).map((i: any) => <option key={i.slug} value={i.slug}>{i.name}</option>)}</Select></Field>
              <Field label="Document type" id="dt"><Select id="dt" value={edit.document_type || ""} onChange={(e) => setEdit({ ...edit, document_type: e.target.value })}><option value="">All</option>{(types.data?.document_types || []).map((d: any) => <option key={d.slug} value={d.slug}>{d.name}</option>)}</Select></Field>
            </div>
            <Field label="Guideline" id="tx"><Textarea id="tx" value={edit.text} onChange={(e) => setEdit({ ...edit, text: e.target.value })} /></Field>
            <Field label="Source URL" id="su"><Input id="su" value={edit.source_url || ""} onChange={(e) => setEdit({ ...edit, source_url: e.target.value })} /></Field>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-violet-600" checked={!!edit.is_verified} onChange={(e) => setEdit({ ...edit, is_verified: e.target.checked })} />Verified against the source today</label>
            <InlineError error={save.error} />
            <div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setEdit(null)}>Cancel</Button><Button loading={save.isPending} disabled={edit.text.length < 10} onClick={() => save.mutate()}>Save</Button></div>
          </div>
        )}
      </Modal>
    </div>
  );
}
