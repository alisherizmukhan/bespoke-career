"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ExportButtons } from "@/components/admin-tools";
import { ExternalLink } from "@/components/icons";
import { Badge, Button, ErrorState, InlineError, Input, LoadingCards, Modal, PageHeader, Select } from "@/components/ui";
import { api } from "@/lib/api";
import { date, money } from "@/lib/format";

const PAGE = 50;

export default function Jobs() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [source, setSource] = useState("");
  const [active, setActive] = useState("all");
  const [page, setPage] = useState(0);
  const [edit, setEdit] = useState<any>(null);
  const jobs = useQuery({
    queryKey: ["admin-jobs", q, source, active, page],
    queryFn: () => api(`/admin/jobs?${new URLSearchParams({ q, source, active, limit: String(PAGE), offset: String(page * PAGE) })}`),
  });
  const save = useMutation({
    mutationFn: ({ id, ...body }: any) => api(`/admin/jobs/${id}`, { method: "PATCH", body }),
    onSuccess: () => { setEdit(null); qc.invalidateQueries({ queryKey: ["admin-jobs"] }); },
  });
  const total = jobs.data?.total || 0;
  return (
    <div>
      <PageHeader title="Jobs" subtitle="Moderate the job board: hide spam or stale postings and fix titles, companies and pay." actions={<ExportButtons dataset="jobs" />} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Input value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} placeholder="Search title, company or location" className="max-w-xs" aria-label="Search jobs" />
        <Select value={source} onChange={(e) => { setSource(e.target.value); setPage(0); }} className="max-w-[170px]" aria-label="Source">
          <option value="">All sources</option>{(jobs.data?.sources || []).map((s: string) => <option key={s} value={s}>{s}</option>)}
        </Select>
        <Select value={active} onChange={(e) => { setActive(e.target.value); setPage(0); }} className="max-w-[150px]" aria-label="Visibility">
          <option value="all">All</option><option value="active">Visible</option><option value="hidden">Hidden</option>
        </Select>
        <span className="ml-auto text-small text-ink-muted">{total.toLocaleString("en-US")} jobs</span>
      </div>
      <InlineError error={save.error} />
      {jobs.isLoading ? <LoadingCards /> : jobs.isError ? <ErrorState error={jobs.error} /> : (
        <div className="overflow-x-auto rounded-lg border border-line bg-white">
          <table className="w-full min-w-[980px] text-sm">
            <thead className="border-b border-line bg-lavender-50 text-left text-small text-ink-muted">
              <tr>{["Job", "Location", "Pay", "Source", "Fetched", "Status", ""].map((h) => <th key={h} className="px-4 py-3 font-medium">{h}</th>)}</tr>
            </thead>
            <tbody>{jobs.data.items.map((j: any) => (
              <tr key={j.id} className="border-b border-line last:border-0">
                <td className="max-w-[340px] px-4 py-3"><p className="truncate font-medium">{j.title}</p><p className="truncate text-xs text-ink-muted">{j.company || "—"}</p></td>
                <td className="px-4 py-3 text-ink-muted">{j.location || "—"}</td>
                <td className="tabular px-4 py-3 text-ink-muted">{j.salary_min || j.salary_max ? `${money(j.salary_min)}–${money(j.salary_max)}${j.salary_period && j.salary_period !== "year" ? ` /${j.salary_period}` : ""}` : "—"}</td>
                <td className="px-4 py-3 text-xs text-ink-muted">{j.source_name}</td>
                <td className="px-4 py-3 text-ink-muted">{date(j.fetched_at)}</td>
                <td className="px-4 py-3">{j.is_active ? <Badge tone="success">Visible</Badge> : <Badge tone="neutral">Hidden</Badge>}</td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-1">
                    <a href={j.url} target="_blank" rel="noreferrer" className="inline-flex h-8 w-8 items-center justify-center rounded-md text-ink-muted hover:bg-lavender-100" aria-label="Open posting"><ExternalLink className="h-4 w-4" /></a>
                    <Button size="sm" variant="ghost" onClick={() => setEdit({ ...j })}>Edit</Button>
                    <Button size="sm" variant={j.is_active ? "danger" : "secondary"} onClick={() => save.mutate({ id: j.id, is_active: !j.is_active })}>{j.is_active ? "Hide" : "Show"}</Button>
                  </div>
                </td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      {total > PAGE && (
        <div className="mt-4 flex items-center justify-end gap-2 text-sm">
          <Button size="sm" variant="secondary" disabled={!page} onClick={() => setPage(page - 1)}>Previous</Button>
          <span className="text-ink-muted">Page {page + 1} of {Math.ceil(total / PAGE)}</span>
          <Button size="sm" variant="secondary" disabled={(page + 1) * PAGE >= total} onClick={() => setPage(page + 1)}>Next</Button>
        </div>
      )}
      {edit && (
        <Modal open onClose={() => setEdit(null)} title="Edit job">
          <div className="space-y-3">
            {[["title", "Title"], ["company", "Company"], ["location", "Location"], ["category", "Category"]].map(([k, l]) => (
              <label key={k} className="block text-small text-ink-muted">{l}<Input value={edit[k] || ""} onChange={(e) => setEdit({ ...edit, [k]: e.target.value })} className="mt-1" /></label>
            ))}
            <div className="grid grid-cols-2 gap-3">
              {[["salary_min", "Pay from"], ["salary_max", "Pay to"]].map(([k, l]) => (
                <label key={k} className="block text-small text-ink-muted">{l}<Input type="number" value={edit[k] ?? ""} onChange={(e) => setEdit({ ...edit, [k]: e.target.value === "" ? null : +e.target.value })} className="mt-1" /></label>
              ))}
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setEdit(null)}>Cancel</Button>
              <Button loading={save.isPending} onClick={() => save.mutate({ id: edit.id, title: edit.title, company: edit.company, location: edit.location, category: edit.category, salary_min: edit.salary_min, salary_max: edit.salary_max })}>Save</Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
