"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { STAGE_LABEL, Stat, StagePill, usd0 } from "@/components/admin-tools";
import { ArrowLeft, Check, Trash2 } from "@/components/icons";
import { Badge, Button, Card, ErrorState, InlineError, Input, LoadingCards, Select, Textarea, cx } from "@/components/ui";
import { api } from "@/lib/api";
import { date } from "@/lib/format";

const KIND_LABEL: Record<string, string> = { note: "Note", call: "Call", email: "Email", task: "Task" };

export default function Customer() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const c = useQuery({ queryKey: ["crm-customer", id], queryFn: () => api(`/admin/crm/customers/${id}`) });
  const refresh = () => { qc.invalidateQueries({ queryKey: ["crm-customer", id] }); qc.invalidateQueries({ queryKey: ["crm-customers"] }); qc.invalidateQueries({ queryKey: ["crm-overview"] }); };
  const patch = useMutation({ mutationFn: (body: any) => api(`/admin/crm/customers/${id}`, { method: "PATCH", body }), onSuccess: refresh });
  const userAct = useMutation({ mutationFn: (body: any) => api(`/admin/users/${id}`, { method: "PATCH", body }), onSuccess: refresh });
  const [kind, setKind] = useState("note");
  const [body, setBody] = useState("");
  const [due, setDue] = useState("");
  const [tagDraft, setTagDraft] = useState("");
  const addNote = useMutation({
    mutationFn: () => api(`/admin/crm/customers/${id}/notes`, { body: { kind, body, due_at: kind === "task" && due ? new Date(due).toISOString() : null } }),
    onSuccess: () => { setBody(""); setDue(""); refresh(); },
  });
  const noteAct = useMutation({
    mutationFn: ({ nid, del, ...b }: any) => api(`/admin/crm/notes/${nid}`, del ? { method: "DELETE" } : { method: "PATCH", body: b }),
    onSuccess: refresh,
  });

  if (c.isLoading) return <LoadingCards />;
  if (c.isError) return <ErrorState error={c.error} retry={() => c.refetch()} />;
  const d = c.data;
  const addTag = () => { const t = tagDraft.trim(); if (t) patch.mutate({ tags: [...d.tags, t] }); setTagDraft(""); };

  return (
    <div>
      <Link href="/admin/crm" className="mb-4 inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink"><ArrowLeft className="h-4 w-4" />All customers</Link>
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="h-display text-h2 leading-tight">{d.full_name || d.email}</h1>
          <p className="mt-1 text-ink-muted">{d.email}{d.city ? ` · ${d.city}` : ""}{d.current_title ? ` · ${d.current_title}` : ""}{d.target_title ? ` → ${d.target_title}` : ""}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <StagePill stage={d.stage} manual={d.stage_manual} />
            {d.stage_manual && <span className="text-xs text-ink-muted">Auto: {STAGE_LABEL[d.stage_auto]}</span>}
            {!d.email_verified && <Badge tone="warning">Email not verified</Badge>}
            {d.account_status !== "active" && <Badge tone="danger">{d.account_status}</Badge>}
            <span className="text-xs text-ink-muted">Joined {date(d.created_at)}</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Select value={d.plan} onChange={(e) => confirm(`Give ${d.email} the ${e.target.value} plan?`) && userAct.mutate({ action: "grant_plan", plan: e.target.value })} className="w-[140px]" aria-label="Grant plan">
            {["free", "plus", "pro", "family"].map((p) => <option key={p} value={p}>Plan: {p}</option>)}
          </Select>
          {d.account_status === "active"
            ? <Button variant="danger" onClick={() => confirm(`Suspend ${d.email}?`) && userAct.mutate({ action: "suspend" })}>Suspend</Button>
            : <Button variant="secondary" onClick={() => userAct.mutate({ action: "restore" })}>Restore</Button>}
          <a href={`mailto:${d.email}`} className="inline-flex h-10 items-center rounded-md border border-line bg-white px-4 text-sm font-medium hover:bg-lavender-100">Email</a>
        </div>
      </div>
      <InlineError error={patch.error || userAct.error} />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Plan" value={<span className="capitalize">{d.plan}</span>} sub={d.interval ? `${d.interval}ly · ${d.cancel_at_period_end ? "ends" : "renews"} ${date(d.renews_at)}` : "No subscription"} />
        <Stat label="MRR" value={d.mrr ? usd0(d.mrr) : "$0"} sub={`Lifetime ${usd0(d.lifetime_revenue)}`} />
        <Stat label="Activity" value={d.applications} sub={`applications · ${d.resumes} resumes · ${d.ai_calls} AI calls`} />
        <Stat label="Engagement" value={`${d.engagement}/100`} sub={d.last_seen_at ? `Last seen ${date(d.last_seen_at)}` : "Never active"} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.5fr_1fr]">
        <div className="space-y-6">
          <Card>
            <p className="text-body font-semibold">Log activity</p>
            <div className="mt-3 flex flex-wrap gap-1">
              {Object.entries(KIND_LABEL).map(([k, l]) => (
                <button key={k} type="button" onClick={() => setKind(k)} className={cx("rounded-md px-3 py-1.5 text-small font-medium", kind === k ? "bg-ink text-white" : "text-ink-muted hover:bg-lavender-100")}>{l}</button>
              ))}
            </div>
            <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} className="mt-3" placeholder={kind === "task" ? "What needs to happen" : kind === "call" ? "What you discussed" : "Write a note"} aria-label="Note" />
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {kind === "task" && <Input type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} className="max-w-[230px]" aria-label="Due" />}
              <Button loading={addNote.isPending} disabled={!body.trim()} onClick={() => addNote.mutate()}>Save {KIND_LABEL[kind].toLowerCase()}</Button>
            </div>
            <InlineError error={addNote.error} />
          </Card>

          <Card className="!p-0">
            <p className="border-b border-line px-5 py-4 text-body font-semibold">Timeline <span className="font-normal text-ink-muted">· {d.notes.length}</span></p>
            {d.notes.length ? d.notes.map((n: any) => {
              const overdue = n.kind === "task" && !n.done && n.due_at && new Date(n.due_at) < new Date();
              return (
                <div key={n.id} className="flex gap-3 border-b border-line px-5 py-4 last:border-0">
                  {n.kind === "task"
                    ? <button type="button" aria-label={n.done ? "Mark open" : "Mark done"} onClick={() => noteAct.mutate({ nid: n.id, done: !n.done })}
                        className={cx("mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded border", n.done ? "border-ink bg-ink text-white" : "border-field")}>{n.done && <Check className="h-4 w-4" />}</button>
                    : <span className="mt-0.5 w-5 shrink-0 font-mono text-xs text-ink-faint">{KIND_LABEL[n.kind][0]}</span>}
                  <div className="min-w-0 flex-1">
                    <p className={cx("whitespace-pre-wrap text-sm", n.done && "text-ink-muted line-through")}>{n.body}</p>
                    <p className="mt-1 text-xs text-ink-muted">
                      {KIND_LABEL[n.kind]} · {n.author} · {date(n.created_at)}
                      {n.due_at && <span className={cx(overdue && "font-medium text-danger")}> · due {date(n.due_at)}</span>}
                    </p>
                  </div>
                  <button type="button" aria-label="Delete" onClick={() => confirm("Delete this entry?") && noteAct.mutate({ nid: n.id, del: true })} className="text-ink-faint hover:text-danger"><Trash2 className="h-4 w-4" /></button>
                </div>
              );
            }) : <p className="px-5 py-8 text-sm text-ink-muted">No notes yet. Log a call, an email or a task above.</p>}
          </Card>

          <Card className="!p-0">
            <p className="border-b border-line px-5 py-4 text-body font-semibold">Applications they're tracking</p>
            {d.recent_applications.length ? (
              <table className="w-full text-sm"><tbody>{d.recent_applications.map((a: any) => (
                <tr key={a.id} className="border-b border-line last:border-0">
                  <td className="px-5 py-3"><p className="font-medium">{a.title}</p><p className="text-xs text-ink-muted">{a.company}</p></td>
                  <td className="px-5 py-3 capitalize text-ink-muted">{a.status}</td>
                  <td className="px-5 py-3 text-right text-ink-muted">{date(a.updated_at)}</td>
                </tr>
              ))}</tbody></table>
            ) : <p className="px-5 py-6 text-sm text-ink-muted">No applications yet</p>}
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <p className="text-body font-semibold">CRM fields</p>
            <label className="mt-4 block text-small text-ink-muted" htmlFor="stage">Stage</label>
            <Select id="stage" value={d.stage_manual ? d.stage : ""} onChange={(e) => patch.mutate({ stage: e.target.value || null })} className="mt-1">
              <option value="">Automatic ({STAGE_LABEL[d.stage_auto]})</option>
              {Object.entries(STAGE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </Select>
            <label className="mt-4 block text-small text-ink-muted" htmlFor="fu">Follow up on</label>
            <div className="mt-1 flex gap-2">
              <Input id="fu" type="date" value={d.follow_up_at ? d.follow_up_at.slice(0, 10) : ""} onChange={(e) => patch.mutate({ follow_up_at: e.target.value ? new Date(e.target.value + "T09:00:00").toISOString() : null })} />
              {d.follow_up_at && <Button variant="ghost" onClick={() => patch.mutate({ follow_up_at: null })}>Clear</Button>}
            </div>
            <p className="mt-4 text-small text-ink-muted">Tags</p>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {d.tags.map((t: string) => (
                <button key={t} type="button" onClick={() => patch.mutate({ tags: d.tags.filter((x: string) => x !== t) })} className="rounded-sm bg-lavender-100 px-2 py-1 text-xs hover:bg-danger-soft hover:text-danger" title="Remove tag">{t} ×</button>
              ))}
            </div>
            <div className="mt-2 flex gap-2">
              <Input value={tagDraft} onChange={(e) => setTagDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addTag()} placeholder="Add a tag" aria-label="New tag" />
              <Button variant="secondary" onClick={addTag}>Add</Button>
            </div>
          </Card>

          <Card className="!p-0">
            <p className="border-b border-line px-5 py-4 text-body font-semibold">Subscriptions</p>
            {d.subscriptions.length ? d.subscriptions.map((s: any) => (
              <div key={s.id} className="flex items-center justify-between border-b border-line px-5 py-3 text-sm last:border-0">
                <div><p className="font-medium capitalize">{s.plan} · {s.interval}ly</p><p className="text-xs text-ink-muted">{date(s.start)} → {date(s.end)} · {s.provider}</p></div>
                <Badge tone={s.status === "active" ? (s.cancel_at_period_end ? "warning" : "success") : "neutral"}>{s.cancel_at_period_end && s.status === "active" ? "cancelling" : s.status}</Badge>
              </div>
            )) : <p className="px-5 py-6 text-sm text-ink-muted">Never subscribed</p>}
          </Card>

          <Card className="!p-0">
            <p className="border-b border-line px-5 py-4 text-body font-semibold">Payments</p>
            {d.payments.length ? d.payments.map((p: any) => (
              <div key={p.id} className="flex items-center justify-between border-b border-line px-5 py-3 text-sm last:border-0">
                <div><p>{p.description}</p><p className="text-xs text-ink-muted">{date(p.created_at)}</p></div>
                <span className="tabular font-medium">{usd0(p.amount)}{p.is_test && <span className="ml-1 text-xs font-normal text-warning">test</span>}</span>
              </div>
            )) : <p className="px-5 py-6 text-sm text-ink-muted">No payments</p>}
          </Card>

          <Card className="!p-0">
            <p className="border-b border-line px-5 py-4 text-body font-semibold">Recent events</p>
            {d.events.length ? d.events.slice(0, 15).map((e: any, i: number) => (
              <div key={i} className="flex justify-between gap-3 border-b border-line px-5 py-2.5 text-xs last:border-0">
                <span className="font-mono">{e.action}</span><span className="shrink-0 text-ink-muted">{date(e.created_at)}</span>
              </div>
            )) : <p className="px-5 py-6 text-sm text-ink-muted">No events</p>}
          </Card>
        </div>
      </div>
    </div>
  );
}
