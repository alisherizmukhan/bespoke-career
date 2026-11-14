"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, CalendarPlus, KanbanSquare, LayoutList, Plus, Search, Table2, Trash2 } from "lucide-react";
import { useState } from "react";
import { CompanyAvatar } from "@/components/jobs";
import { Badge, Button, Card, EmptyState, ErrorState, Field, InlineError, Input, LoadingCards, Modal, PageHeader, STATUS_TONE, Select, StatCard, Tabs, Textarea, cx } from "@/components/ui";
import { api } from "@/lib/api";
import { date, money, salaryLabel } from "@/lib/format";

type App = any;
const BOARD_COLS = ["interested", "preparing", "applied", "screening", "interview", "final_interview", "offer", "rejected"];

function AppForm({ initial, onSaved, onCancel }: { initial?: App; onSaved: (a: App) => void; onCancel: () => void }) {
  const qc = useQueryClient();
  const pipe = useQuery({ queryKey: ["pipeline"], queryFn: () => api("/applications/pipeline") });
  const versions = useQuery({ queryKey: ["resume-history"], queryFn: () => api("/resume-intelligence/history") });
  const [f, setF] = useState<any>(initial || { status: "interested" });
  const [err, setErr] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: any) => setF((x: any) => ({ ...x, [k]: v }));
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr(null);
    const keys = ["company_name", "company_website", "job_title", "job_url", "description", "location", "employment_type", "work_arrangement", "salary_min", "salary_max", "currency", "applied_at", "resume_version_id", "cover_letter", "recruiter_name", "recruiter_email", "notes", "status"];
    const body: any = {};
    keys.forEach((k) => { if (f[k] !== undefined && f[k] !== "") body[k] = f[k]; });
    try {
      const a = initial ? await api(`/applications/${initial.id}`, { method: "PATCH", body }) : await api("/applications", { body });
      qc.invalidateQueries({ queryKey: ["applications"] }); qc.invalidateQueries({ queryKey: ["app-stats"] });
      onSaved(a);
    } catch (x) { setErr(x); } finally { setBusy(false); }
  };
  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Company *" id="co"><Input id="co" required value={f.company_name || ""} onChange={(e) => set("company_name", e.target.value)} /></Field>
        <Field label="Job title *" id="jt"><Input id="jt" required value={f.job_title || ""} onChange={(e) => set("job_title", e.target.value)} /></Field>
        <Field label="Status" id="st"><Select id="st" value={f.status} onChange={(e) => set("status", e.target.value)}>{(pipe.data || []).map((p: any) => <option key={p.key} value={p.key}>{p.label}</option>)}</Select></Field>
        <Field label="Location" id="lo"><Input id="lo" value={f.location || ""} onChange={(e) => set("location", e.target.value)} /></Field>
        <Field label="Job URL" id="ju"><Input id="ju" type="url" value={f.job_url || ""} onChange={(e) => set("job_url", e.target.value)} /></Field>
        <Field label="Company website" id="cw"><Input id="cw" value={f.company_website || ""} onChange={(e) => set("company_website", e.target.value)} /></Field>
        <Field label="Employment type" id="et"><Select id="et" value={f.employment_type || ""} onChange={(e) => set("employment_type", e.target.value)}><option value="">—</option><option value="full-time">Full-time</option><option value="part-time">Part-time</option><option value="contract">Contract</option><option value="internship">Internship</option></Select></Field>
        <Field label="Work arrangement" id="wa"><Select id="wa" value={f.work_arrangement || ""} onChange={(e) => set("work_arrangement", e.target.value)}><option value="">—</option><option value="remote">Remote</option><option value="hybrid">Hybrid</option><option value="onsite">On-site</option></Select></Field>
        <Field label="Salary min" id="smin"><Input id="smin" type="number" value={f.salary_min ?? ""} onChange={(e) => set("salary_min", e.target.value ? Number(e.target.value) : null)} /></Field>
        <Field label="Salary max" id="smax"><Input id="smax" type="number" value={f.salary_max ?? ""} onChange={(e) => set("salary_max", e.target.value ? Number(e.target.value) : null)} /></Field>
        <Field label="Applied on" id="ad"><Input id="ad" type="date" value={f.applied_at || ""} onChange={(e) => set("applied_at", e.target.value)} /></Field>
        <Field label="Resume version" id="rv">
          <Select id="rv" value={f.resume_version_id || ""} onChange={(e) => set("resume_version_id", e.target.value || null)}>
            <option value="">—</option>
            {(versions.data || []).filter((r: any) => r.latest_version).map((r: any) => <option key={r.latest_version.id} value={r.latest_version.id}>{r.title} · {r.latest_version.name}</option>)}
          </Select>
        </Field>
        <Field label="Recruiter" id="rn"><Input id="rn" value={f.recruiter_name || ""} onChange={(e) => set("recruiter_name", e.target.value)} /></Field>
        <Field label="Recruiter email" id="re"><Input id="re" type="email" value={f.recruiter_email || ""} onChange={(e) => set("recruiter_email", e.target.value)} /></Field>
      </div>
      <Field label="Job description" id="jd" hint="Paste it to tailor your resume and get interview prep."><Textarea id="jd" value={f.description || ""} onChange={(e) => set("description", e.target.value)} /></Field>
      <Field label="Notes" id="nt"><Textarea id="nt" value={f.notes || ""} onChange={(e) => set("notes", e.target.value)} className="min-h-[80px]" /></Field>
      <InlineError error={err} />
      <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button><Button type="submit" loading={busy}>{initial ? "Save" : "Add application"}</Button></div>
    </form>
  );
}

function Detail({ id, onClose }: { id: string; onClose: () => void }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["application", id], queryFn: () => api(`/applications/${id}`) });
  const [edit, setEdit] = useState(false);
  const [iv, setIv] = useState<any>({ title: "Interview", type: "video", duration_min: 60 });
  const [rm, setRm] = useState<any>({ title: "", due_at: "" });
  const refresh = () => { qc.invalidateQueries({ queryKey: ["application", id] }); qc.invalidateQueries({ queryKey: ["applications"] }); };
  const addIv = useMutation({ mutationFn: () => api(`/applications/${id}/interviews`, { body: { ...iv, scheduled_at: new Date(iv.scheduled_at).toISOString(), timezone: Intl.DateTimeFormat().resolvedOptions().timeZone } }), onSuccess: () => { refresh(); setIv({ title: "Interview", type: "video", duration_min: 60 }); } });
  const addRm = useMutation({ mutationFn: () => api(`/applications/${id}/reminders`, { body: { title: rm.title, due_at: new Date(rm.due_at).toISOString() } }), onSuccess: () => { refresh(); setRm({ title: "", due_at: "" }); } });
  const del = useMutation({ mutationFn: () => api(`/applications/${id}`, { method: "DELETE" }), onSuccess: () => { qc.invalidateQueries({ queryKey: ["applications"] }); onClose(); } });
  if (q.isLoading) return <LoadingCards n={2} />;
  if (q.isError) return <ErrorState error={q.error} />;
  const a = q.data;
  if (edit) return <AppForm initial={a} onSaved={() => { setEdit(false); refresh(); }} onCancel={() => setEdit(false)} />;
  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3">
        <CompanyAvatar name={a.company_name} />
        <div className="flex-1"><p className="font-semibold">{a.job_title}</p><p className="text-sm text-ink-muted">{a.company_name}{a.location ? ` · ${a.location}` : ""}</p></div>
        <Badge tone={STATUS_TONE[a.status] || "neutral"}>{a.status_label}</Badge>
      </div>
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div><p className="text-xs text-ink-muted">Applied</p><p>{a.applied_at ? date(a.applied_at) : "—"}</p></div>
        <div><p className="text-xs text-ink-muted">Salary</p><p>{salaryLabel({ ...a, salary_period: "year" }) || "—"}</p></div>
        <div><p className="text-xs text-ink-muted">Resume</p><p>{a.resume_version_name || "—"}</p></div>
        <div><p className="text-xs text-ink-muted">Recruiter</p><p>{a.recruiter_name || "—"}</p></div>
      </div>
      {a.job_url && <a href={a.job_url} target="_blank" rel="noopener noreferrer" className="link text-sm">Open job posting</a>}
      {a.notes && <p className="whitespace-pre-line rounded-md bg-lavender-50 p-3 text-sm">{a.notes}</p>}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" onClick={() => setEdit(true)}>Edit details</Button>
        <Button size="sm" variant="soft" href={`/app/resumes?application=${a.id}`}>Tailor resume</Button>
        <Button size="sm" variant="soft" href={`/app/assistant?q=${encodeURIComponent(`Prepare me for my interview with ${a.company_name} for the ${a.job_title} role.`)}`}>Interview prep</Button>
        <Button size="sm" variant="danger" loading={del.isPending} onClick={() => confirm("Delete this application?") && del.mutate()}><Trash2 className="h-4 w-4" />Delete</Button>
      </div>

      <div>
        <p className="mb-2 text-sm font-semibold">Interviews</p>
        {a.interviews.map((i: any) => (
          <div key={i.id} className="mb-2 rounded-md border border-line p-3 text-sm"><b>{i.title}</b> · {i.type} · {date(i.scheduled_at, true)} ({i.duration_min} min){i.interviewer ? ` · ${i.interviewer}` : ""}{i.meeting_url && <> · <a className="link" href={i.meeting_url} target="_blank" rel="noopener noreferrer">link</a></>}</div>
        ))}
        <form className="grid gap-2 rounded-md bg-lavender-50 p-3 sm:grid-cols-[1fr_1fr_auto]" onSubmit={(e) => { e.preventDefault(); addIv.mutate(); }}>
          <Input required value={iv.title} onChange={(e) => setIv({ ...iv, title: e.target.value })} placeholder="Stage, e.g. Technical interview" aria-label="Interview title" />
          <Input required type="datetime-local" value={iv.scheduled_at || ""} onChange={(e) => setIv({ ...iv, scheduled_at: e.target.value })} aria-label="Date and time" />
          <Button type="submit" size="sm" loading={addIv.isPending}><CalendarPlus className="h-4 w-4" />Add</Button>
          <Input value={iv.interviewer || ""} onChange={(e) => setIv({ ...iv, interviewer: e.target.value })} placeholder="Interviewer (optional)" aria-label="Interviewer" />
          <Input value={iv.meeting_url || ""} onChange={(e) => setIv({ ...iv, meeting_url: e.target.value })} placeholder="Meeting URL (optional)" aria-label="Meeting URL" />
        </form>
        <InlineError error={addIv.error} />
      </div>

      <div>
        <p className="mb-2 text-sm font-semibold">Reminders</p>
        {a.reminders.map((r: any) => <p key={r.id} className={cx("mb-1 text-sm", r.done && "text-ink-muted line-through")}><Bell className="mr-1.5 inline h-3.5 w-3.5 text-violet-600" />{r.title} · {date(r.due_at, true)}</p>)}
        <form className="mt-2 grid gap-2 sm:grid-cols-[1fr_1fr_auto]" onSubmit={(e) => { e.preventDefault(); addRm.mutate(); }}>
          <Input required value={rm.title} onChange={(e) => setRm({ ...rm, title: e.target.value })} placeholder="e.g. Follow up with recruiter" aria-label="Reminder" />
          <Input required type="datetime-local" value={rm.due_at} onChange={(e) => setRm({ ...rm, due_at: e.target.value })} aria-label="Due" />
          <Button type="submit" size="sm" variant="soft" loading={addRm.isPending}>Add</Button>
        </form>
      </div>

      <div>
        <p className="mb-2 text-sm font-semibold">History</p>
        <ol className="space-y-1.5 border-l-2 border-violet-200 pl-4 text-sm">
          {a.events.map((e: any, i: number) => <li key={i}><span className="text-ink-muted">{date(e.created_at, true)}</span> — {e.type === "status_changed" ? `${e.from} → ${e.to}` : e.type.replace("_", " ")}{e.note ? `: ${e.note}` : ""}</li>)}
        </ol>
      </div>
    </div>
  );
}

export default function Tracker() {
  const qc = useQueryClient();
  const [view, setView] = useState<"board" | "table" | "list">("board");
  const [filter, setFilter] = useState({ q: "", status: "" });
  const [creating, setCreating] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [drag, setDrag] = useState<string | null>(null);
  const params = new URLSearchParams();
  if (filter.q) params.set("q", filter.q);
  if (filter.status) params.set("status", filter.status);
  const q = useQuery({ queryKey: ["applications", params.toString()], queryFn: () => api(`/applications?${params}`) });
  const stats = useQuery({ queryKey: ["app-stats"], queryFn: () => api("/applications/statistics") });
  const pipe = useQuery({ queryKey: ["pipeline"], queryFn: () => api("/applications/pipeline") });
  const move = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => api(`/applications/${id}`, { method: "PATCH", body: { status } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["applications"] }); qc.invalidateQueries({ queryKey: ["app-stats"] }); },
  });
  const labels: Record<string, string> = Object.fromEntries((pipe.data || []).map((p: any) => [p.key, p.label]));
  const apps: App[] = q.data || [];

  return (
    <div>
      <PageHeader title="Job Tracker" subtitle="Every application, interview and follow-up in one place."
        actions={<><Tabs value={view} onChange={setView} items={[{ value: "board", label: "Board", icon: KanbanSquare }, { value: "table", label: "Table", icon: Table2 }, { value: "list", label: "List", icon: LayoutList }]} /><Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" />Add application</Button></>} />
      {stats.data && (
        <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard icon={KanbanSquare} label="Active" value={stats.data.active} sub={`${stats.data.applied_this_week} applied this week`} />
          <StatCard icon={Bell} label="Response rate" value={`${stats.data.response_rate}%`} sub="Of submitted applications" />
          <StatCard icon={CalendarPlus} label="Interview rate" value={`${stats.data.interview_rate}%`} sub={`${stats.data.upcoming_interviews} upcoming`} tone="warning" />
          <StatCard icon={Search} label="Awaiting reply" value={stats.data.awaiting_response.length} sub="No update in 10+ days" tone="danger" />
        </div>
      )}
      <div className="mb-4 flex flex-wrap gap-2">
        <Input value={filter.q} onChange={(e) => setFilter({ ...filter, q: e.target.value })} placeholder="Filter by company or title" className="max-w-xs" aria-label="Filter" />
        <Select value={filter.status} onChange={(e) => setFilter({ ...filter, status: e.target.value })} className="max-w-[220px]" aria-label="Status">
          <option value="">All statuses</option>{(pipe.data || []).map((p: any) => <option key={p.key} value={p.key}>{p.label}</option>)}
        </Select>
      </div>
      {q.isLoading ? <LoadingCards /> : q.isError ? <ErrorState error={q.error} retry={() => q.refetch()} /> : !apps.length && !filter.q && !filter.status ? (
        <EmptyState icon={KanbanSquare} title="Track your first application" body="Add one manually or click “Track this job” on any job posting." action={<div className="flex gap-2"><Button onClick={() => setCreating(true)}>Add application</Button><Button variant="secondary" href="/app/jobs">Browse jobs</Button></div>} />
      ) : view === "board" ? (
        <div className="-mx-4 overflow-x-auto px-4 pb-4 sm:-mx-6 sm:px-6">
          <div className="flex min-w-max gap-3">
            {BOARD_COLS.map((col) => {
              const items = apps.filter((a) => a.status === col);
              return (
                <div key={col} onDragOver={(e) => e.preventDefault()} onDrop={() => { if (drag) move.mutate({ id: drag, status: col }); setDrag(null); }}
                  className="w-[260px] shrink-0 rounded-lg bg-lavender-100 p-2.5">
                  <div className="mb-2 flex items-center justify-between px-1"><p className="text-[13px] font-semibold">{labels[col] || col}</p><span className="tabular rounded-full bg-white px-2 text-xs text-ink-muted">{items.length}</span></div>
                  <div className="min-h-[60px] space-y-2">
                    {items.map((a) => (
                      <button key={a.id} draggable onDragStart={() => setDrag(a.id)} onClick={() => setOpen(a.id)} className="card block w-full p-3 text-left hover:shadow-card">
                        <p className="line-clamp-2 text-sm font-semibold">{a.job_title}</p>
                        <p className="text-xs text-ink-muted">{a.company_name}</p>
                        <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] text-ink-muted">
                          {a.salary_max && <span>{money(a.salary_max, { compact: true })}</span>}
                          {a.next_interview && <span className="text-warning">Interview {date(a.next_interview)}</span>}
                          {a.applied_at && <span>Applied {date(a.applied_at)}</span>}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-ink-muted">Drag cards between columns to update the status. Withdrawn and archived items are in Table view.</p>
        </div>
      ) : view === "table" ? (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="border-b border-line bg-lavender-50 text-left text-[13px] text-ink-muted"><tr>{["Company", "Title", "Status", "Location", "Salary", "Applied", "Next interview"].map((h) => <th key={h} className="px-4 py-3 font-semibold">{h}</th>)}</tr></thead>
            <tbody>{apps.map((a) => (
              <tr key={a.id} onClick={() => setOpen(a.id)} className="cursor-pointer border-b border-line last:border-0 hover:bg-lavender-50">
                <td className="px-4 py-3 font-semibold">{a.company_name}</td><td className="px-4 py-3">{a.job_title}</td>
                <td className="px-4 py-3"><Badge tone={STATUS_TONE[a.status] || "neutral"}>{a.status_label}</Badge></td>
                <td className="px-4 py-3 text-ink-muted">{a.location || "—"}</td><td className="tabular px-4 py-3">{a.salary_max ? money(a.salary_max, { compact: true }) : "—"}</td>
                <td className="px-4 py-3 text-ink-muted">{a.applied_at ? date(a.applied_at) : "—"}</td><td className="px-4 py-3 text-ink-muted">{a.next_interview ? date(a.next_interview, true) : "—"}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      ) : (
        <div className="space-y-2">{apps.map((a) => (
          <Card key={a.id} className="flex cursor-pointer items-center gap-3 !p-4 hover:shadow-card" onClick={() => setOpen(a.id)}>
            <CompanyAvatar name={a.company_name} size={40} />
            <div className="min-w-0 flex-1"><p className="truncate font-semibold">{a.job_title}</p><p className="text-sm text-ink-muted">{a.company_name} · updated {date(a.updated_at)}</p></div>
            <Badge tone={STATUS_TONE[a.status] || "neutral"}>{a.status_label}</Badge>
          </Card>
        ))}</div>
      )}
      <InlineError error={move.error} />
      <Modal open={creating} onClose={() => setCreating(false)} title="Add application" wide><AppForm onSaved={() => setCreating(false)} onCancel={() => setCreating(false)} /></Modal>
      <Modal open={!!open} onClose={() => setOpen(null)} title="Application" wide>{open && <Detail id={open} onClose={() => setOpen(null)} />}</Modal>
    </div>
  );
}
