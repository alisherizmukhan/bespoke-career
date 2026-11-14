"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, Check, CheckCircle2, Download, FileDown, GitCompare, History, Lightbulb, RotateCcw, Sparkles, Target, Wand2, XCircle } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, use, useEffect, useState } from "react";
import { ResumeEditor } from "@/components/resume-editor";
import { Badge, Button, Card, ErrorState, Field, InlineError, Modal, ScoreRing, Select, Skeleton, Tabs, Textarea, cx } from "@/components/ui";
import { api, download } from "@/lib/api";
import { date } from "@/lib/format";

type Tab = "content" | "generate" | "ats" | "versions" | "cover";

function AtsResult({ r }: { r: any }) {
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-6">
        <ScoreRing score={r.score} size={110} label={r.match_score != null ? "Match" : "Quality"} />
        <div className="grid flex-1 grid-cols-2 gap-3 text-sm sm:grid-cols-3">
          <div className="rounded-md bg-lavender-50 p-3"><p className="text-xs text-ink-muted">Structure</p><p className="tabular text-lg font-bold">{r.structure_score}</p></div>
          <div className="rounded-md bg-lavender-50 p-3"><p className="text-xs text-ink-muted">Bullet quality</p><p className="tabular text-lg font-bold">{r.quality_score}</p></div>
          <div className="rounded-md bg-lavender-50 p-3"><p className="text-xs text-ink-muted">Measurable results</p><p className="tabular text-lg font-bold">{r.stats.quantified_bullets}/{r.stats.bullets}</p></div>
        </div>
      </div>
      {r.keywords && (
        <div className="grid gap-4 md:grid-cols-2">
          <div><p className="mb-2 text-sm font-semibold text-success">Requirements found in your resume</p><div className="flex flex-wrap gap-1.5">{[...r.keywords.matched_required, ...r.keywords.matched_preferred].map((k: string) => <Badge key={k} tone="success" dot={false}><Check className="h-3 w-3" />{k}</Badge>)}{!r.keywords.matched_required.length && <span className="text-sm text-ink-muted">None yet</span>}</div></div>
          <div><p className="mb-2 text-sm font-semibold text-warning">Missing requirements</p><div className="flex flex-wrap gap-1.5">{r.keywords.missing_required.map((k: string) => <Badge key={k} tone="warning" dot={false}>{k}</Badge>)}{r.keywords.missing_preferred.map((k: string) => <Badge key={k} tone="neutral" dot={false}>{k} · preferred</Badge>)}{!r.keywords.missing_required.length && <span className="text-sm text-ink-muted">Nothing critical missing</span>}</div></div>
        </div>
      )}
      {(r.recommendations?.length > 0 || r.formatting_issues?.length > 0) && (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-lg bg-violet-100 p-4"><p className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-violet-900"><Lightbulb className="h-4 w-4" />Recommendations</p><ul className="space-y-1.5 text-sm text-violet-900">{r.recommendations.map((x: string, i: number) => <li key={i}>• {x}</li>)}</ul></div>
          <div className="rounded-lg bg-warning-soft p-4"><p className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-warning"><AlertTriangle className="h-4 w-4" />Formatting & structure</p><ul className="space-y-1.5 text-sm text-warning">{r.formatting_issues.length ? r.formatting_issues.map((x: string, i: number) => <li key={i}>• {x}</li>) : <li>No issues found.</li>}</ul></div>
        </div>
      )}
      {r.rewrite_suggestions?.length > 0 && <div><p className="mb-2 text-sm font-semibold">Suggested rewrites</p><ul className="space-y-2 text-sm">{r.rewrite_suggestions.map((x: string, i: number) => <li key={i} className="rounded-md border border-line p-3">{x}</li>)}</ul></div>}
      <p className="text-xs text-ink-muted">{r.disclaimer}</p>
    </div>
  );
}

function Validation({ v }: { v: any }) {
  return (
    <ul className="space-y-2">
      {v.checks.map((c: any) => (
        <li key={c.check} className="flex items-start gap-2 text-sm">
          {c.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />}
          <span><b className="capitalize">{c.check.replace(/_/g, " ")}</b> — {c.detail}</span>
        </li>
      ))}
    </ul>
  );
}

function ResumeDetail({ id }: { id: string }) {
  const sp = useSearchParams();
  const router = useRouter();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["resume", id], queryFn: () => api(`/resumes/${id}`) });
  const types = useQuery({ queryKey: ["doc-types"], queryFn: () => api("/resume-intelligence/document-types") });
  const [tab, setTab] = useState<Tab>("content");
  const [content, setContent] = useState<any>(null);
  const [jd, setJd] = useState("");
  const [docType, setDocType] = useState("professional");
  const [template, setTemplate] = useState("classic");
  const [purpose, setPurpose] = useState("corporate");
  const [genResult, setGenResult] = useState<any>(null);
  const [ats, setAts] = useState<any>(null);
  const [version, setVersion] = useState<string>("");
  const [cmp, setCmp] = useState<any>(null);
  const [letter, setLetter] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (q.data && !content) { setContent(q.data.parsed_content || {}); setDocType(q.data.document_type || "professional"); if (q.data.status === "parsed") setTab("content"); }
  }, [q.data, content]);
  useEffect(() => {
    const job = sp.get("job"), app = sp.get("application");
    if (job) api(`/jobs/${job}`).then((j) => { setJd(`${j.title} — ${j.company || ""}\n\n${j.description || ""}`); setTab("ats"); }).catch(() => {});
    if (app) api(`/applications/${app}`).then((a) => { setJd(`${a.job_title} — ${a.company_name}\n\n${a.description || ""}`); setTab("generate"); }).catch(() => {});
  }, [sp]);

  const verify = useMutation({ mutationFn: () => api(`/resumes/${id}/verify`, { method: "PUT", body: { content } }), onSuccess: (r) => { qc.setQueryData(["resume", id], r); qc.invalidateQueries({ queryKey: ["resume-history"] }); setSaved(true); } });
  const recommend = useMutation({ mutationFn: () => api("/resume-intelligence/recommend-document", { body: { purpose, job_description: jd || null } }), onSuccess: (r) => setDocType(r.document_type) });
  const generate = useMutation({
    mutationFn: () => api("/resume-intelligence/generate", { body: { resume_id: id, document_type: docType, template, job_description: jd || null, application_id: sp.get("application") || null } }),
    onSuccess: (r) => { setGenResult(r); setVersion(r.version.id); qc.invalidateQueries({ queryKey: ["resume", id] }); },
  });
  const analyze = useMutation({ mutationFn: () => api("/resume-intelligence/analyze", { body: { resume_id: id, version_id: version || null, job_description: jd || null } }), onSuccess: (r) => { setAts(r); qc.invalidateQueries({ queryKey: ["resume", id] }); } });
  const restore = useMutation({ mutationFn: (vid: string) => api(`/resumes/${id}/versions/${vid}/restore`, { method: "POST" }), onSuccess: () => qc.invalidateQueries({ queryKey: ["resume", id] }) });
  const compare = useMutation({ mutationFn: ([a, b]: string[]) => api(`/resumes/${id}/compare?a=${a}&b=${b}`), onSuccess: setCmp });
  const cover = useMutation({ mutationFn: () => api("/resume-intelligence/cover-letter", { body: { resume_id: id, version_id: version || null, job_description: jd } }), onSuccess: (r) => setLetter(r.letter) });
  const exp = useMutation({ mutationFn: ({ fmt, vid }: { fmt: string; vid?: string }) => download(`/resumes/${id}/export`, { version_id: vid || null, format: fmt, template }, `resume.${fmt}`) });
  const del = useMutation({ mutationFn: () => api(`/resumes/${id}`, { method: "DELETE" }), onSuccess: () => { qc.invalidateQueries({ queryKey: ["resume-history"] }); router.push("/app/resumes"); } });

  if (q.isLoading || !content) return <Skeleton className="h-96" />;
  if (q.isError) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  const r = q.data;
  const needsReview = r.status === "parsed";
  const versions = r.versions || [];

  return (
    <div>
      <Link href="/app/resumes" className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-violet-700"><ArrowLeft className="h-4 w-4" />Resumes</Link>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="h-display text-[28px] leading-tight">{r.title}</h1>
          <p className="mt-1 text-sm text-ink-muted">{r.document_type_name} · {versions.length} version{versions.length === 1 ? "" : "s"}{r.original_filename ? <> · <a className="link" href={r.original_url} target="_blank" rel="noopener noreferrer">original file</a></> : null}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={() => exp.mutate({ fmt: "pdf", vid: versions[0]?.id })}><Download className="h-4 w-4" />PDF</Button>
          <Button variant="secondary" size="sm" onClick={() => exp.mutate({ fmt: "docx", vid: versions[0]?.id })}><FileDown className="h-4 w-4" />DOCX</Button>
          <Button variant="danger" size="sm" onClick={() => confirm("Delete this resume and all versions?") && del.mutate()}>Delete</Button>
        </div>
      </div>
      <InlineError error={exp.error} />

      {needsReview && (
        <div className="mb-5 flex items-start gap-3 rounded-lg border border-warning-soft bg-warning-soft p-4 text-sm text-warning">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          <p><b>Review what we extracted.</b> Check every section, fix anything that's wrong, then confirm. We only generate from information you've verified.</p>
        </div>
      )}

      <div className="mb-5 overflow-x-auto">
        <Tabs value={tab} onChange={setTab} items={[
          { value: "content", label: needsReview ? "Review & confirm" : "Content", icon: Check },
          { value: "generate", label: "Generate", icon: Wand2 }, { value: "ats", label: "ATS check", icon: Target },
          { value: "versions", label: "Versions", icon: History }, { value: "cover", label: "Cover letter", icon: Sparkles },
        ]} />
      </div>

      {tab === "content" && (
        <Card>
          <ResumeEditor value={content} onChange={(v) => { setContent(v); setSaved(false); }} />
          <div className="mt-6 flex flex-wrap items-center justify-end gap-3 border-t border-line pt-5">
            {saved && <span className="text-sm text-success">Saved and verified.</span>}
            <InlineError error={verify.error} />
            <Button loading={verify.isPending} onClick={() => verify.mutate()}>{needsReview ? "Confirm information" : "Save changes"}</Button>
          </div>
        </Card>
      )}

      {tab === "generate" && (
        <div className="grid gap-5 lg:grid-cols-[1fr_1.1fr]">
          <Card className="space-y-4">
            <h2 className="font-semibold">Build a tailored version</h2>
            {needsReview && <p className="rounded-md bg-warning-soft px-3 py-2 text-sm text-warning">Confirm your information first (Review & confirm tab).</p>}
            <Field label="What are you applying for?" id="pp">
              <div className="flex gap-2">
                <Select id="pp" value={purpose} onChange={(e) => setPurpose(e.target.value)}>
                  {[["corporate", "Company job"], ["startup", "Startup"], ["federal", "Federal (USAJOBS)"], ["academic", "Academic position"], ["internship", "Internship"], ["graduate_school", "Graduate school"]].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </Select>
                <Button variant="soft" onClick={() => recommend.mutate()} loading={recommend.isPending}>Recommend</Button>
              </div>
            </Field>
            {recommend.data && <div className="rounded-md bg-violet-100 p-3 text-sm text-violet-900"><b>{recommend.data.name}</b> — {recommend.data.reasons.join(" ")}</div>}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Document type" id="dt"><Select id="dt" value={docType} onChange={(e) => setDocType(e.target.value)}>{(types.data?.document_types || []).map((d: any) => <option key={d.slug} value={d.slug}>{d.name}</option>)}</Select></Field>
              <Field label="Template" id="tp"><Select id="tp" value={template} onChange={(e) => setTemplate(e.target.value)}>{(types.data?.templates || []).map((t: any) => <option key={t.slug} value={t.slug}>{t.name}</option>)}</Select></Field>
            </div>
            <p className="text-xs text-ink-muted">{types.data?.document_types.find((d: any) => d.slug === docType)?.description}</p>
            <Field label="Job description (optional)" id="jd1" hint="Paste a posting to tailor the order and wording to it."><Textarea id="jd1" value={jd} onChange={(e) => setJd(e.target.value)} className="min-h-[160px]" /></Field>
            <InlineError error={generate.error} />
            <Button loading={generate.isPending} disabled={needsReview} onClick={() => generate.mutate()} className="w-full"><Wand2 className="h-4 w-4" />Generate version</Button>
          </Card>
          <Card>
            {!genResult ? <div className="grid h-full place-items-center py-16 text-center text-sm text-ink-muted">Your new version and its validation report appear here.</div> : (
              <div className="space-y-5">
                <div className="flex items-center justify-between"><div><p className="font-semibold">{genResult.version.name}</p><p className="text-xs text-ink-muted">{genResult.meta.method === "ai" ? "Rewritten with AI from your verified data" : "Reordered from your verified data"}</p></div><Badge tone="success">Saved</Badge></div>
                <Validation v={genResult.validation} />
                {genResult.meta.missing_information?.length > 0 && <div className="rounded-md bg-lavender-50 p-3 text-sm"><p className="font-semibold">Add these to make it stronger</p><ul className="mt-1 list-disc pl-5 text-ink-muted">{genResult.meta.missing_information.map((m: string) => <li key={m}>{m}</li>)}</ul></div>}
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => exp.mutate({ fmt: "pdf", vid: genResult.version.id })}><Download className="h-4 w-4" />Download PDF</Button>
                  <Button size="sm" variant="secondary" onClick={() => exp.mutate({ fmt: "docx", vid: genResult.version.id })}>DOCX</Button>
                  <Button size="sm" variant="soft" onClick={() => { setVersion(genResult.version.id); setTab("ats"); }}>Check ATS match</Button>
                </div>
              </div>
            )}
          </Card>
        </div>
      )}

      {tab === "ats" && (
        <div className="grid gap-5 lg:grid-cols-[1fr_1.4fr]">
          <Card className="space-y-4">
            <h2 className="font-semibold">Check against a job</h2>
            <Field label="Version" id="v1"><Select id="v1" value={version} onChange={(e) => setVersion(e.target.value)}><option value="">Verified data (no version)</option>{versions.map((v: any) => <option key={v.id} value={v.id}>{v.name}</option>)}</Select></Field>
            <Field label="Job description" id="jd2" hint="Leave empty for a general quality check."><Textarea id="jd2" value={jd} onChange={(e) => setJd(e.target.value)} className="min-h-[220px]" /></Field>
            <InlineError error={analyze.error} />
            <Button className="w-full" loading={analyze.isPending} onClick={() => analyze.mutate()}><Target className="h-4 w-4" />Analyze</Button>
          </Card>
          <Card>{ats ? <AtsResult r={ats} /> : <div className="grid h-full place-items-center py-16 text-center text-sm text-ink-muted">Paste a job description and run the analysis to see matched and missing requirements.</div>}</Card>
        </div>
      )}

      {tab === "versions" && (
        <Card>
          {!versions.length ? <p className="py-8 text-center text-sm text-ink-muted">No versions yet. Generate one from the Generate tab.</p> : (
            <div className="divide-y divide-line">
              {versions.map((v: any, i: number) => (
                <div key={v.id} className="flex flex-wrap items-center gap-3 py-3">
                  <span className="tabular grid h-9 w-9 place-items-center rounded-full bg-violet-100 text-sm font-bold text-violet-700">v{v.version}</span>
                  <div className="min-w-0 flex-1"><p className="truncate font-medium">{v.name}</p><p className="text-xs text-ink-muted">{date(v.created_at, true)} · {v.source}{v.has_job_description ? " · tailored" : ""}</p></div>
                  <Button size="sm" variant="ghost" onClick={() => exp.mutate({ fmt: "pdf", vid: v.id })}><Download className="h-4 w-4" />PDF</Button>
                  <Button size="sm" variant="ghost" onClick={() => exp.mutate({ fmt: "docx", vid: v.id })}>DOCX</Button>
                  {i < versions.length - 1 && <Button size="sm" variant="ghost" onClick={() => compare.mutate([versions[i + 1].id, v.id])}><GitCompare className="h-4 w-4" />Compare</Button>}
                  <Button size="sm" variant="ghost" loading={restore.isPending} onClick={() => restore.mutate(v.id)}><RotateCcw className="h-4 w-4" />Restore</Button>
                </div>
              ))}
            </div>
          )}
          <Modal open={!!cmp} onClose={() => setCmp(null)} title="Compare versions" wide>
            {cmp && (
              <div className="space-y-4 text-sm">
                <p className="text-ink-muted">{cmp.a.name} → {cmp.b.name}</p>
                {cmp.score_a != null && <p>Job match: <b>{cmp.score_a}</b> → <b className={cx(cmp.score_b >= cmp.score_a ? "text-success" : "text-danger")}>{cmp.score_b}</b></p>}
                <div className="grid gap-4 sm:grid-cols-2">
                  <div><p className="font-semibold text-success">Added</p><ul className="mt-1 space-y-1">{[...cmp.skills_added.map((s: string) => `Skill: ${s}`), ...cmp.bullets_added].slice(0, 15).map((x: string) => <li key={x}>+ {x}</li>)}</ul></div>
                  <div><p className="font-semibold text-danger">Removed</p><ul className="mt-1 space-y-1">{[...cmp.skills_removed.map((s: string) => `Skill: ${s}`), ...cmp.bullets_removed].slice(0, 15).map((x: string) => <li key={x}>− {x}</li>)}</ul></div>
                </div>
                {cmp.summary_changed && <p className="text-ink-muted">The summary was rewritten.</p>}
              </div>
            )}
          </Modal>
        </Card>
      )}

      {tab === "cover" && (
        <div className="grid gap-5 lg:grid-cols-2">
          <Card className="space-y-4">
            <h2 className="font-semibold">Cover letter</h2>
            <Field label="Job description" id="jd3"><Textarea id="jd3" value={jd} onChange={(e) => setJd(e.target.value)} className="min-h-[220px]" /></Field>
            <InlineError error={cover.error} />
            <Button loading={cover.isPending} disabled={jd.length < 30} onClick={() => cover.mutate()}><Sparkles className="h-4 w-4" />Write cover letter</Button>
          </Card>
          <Card>{letter ? <><Textarea value={letter} onChange={(e) => setLetter(e.target.value)} className="min-h-[420px]" /><Button size="sm" variant="secondary" className="mt-3" onClick={() => navigator.clipboard.writeText(letter)}>Copy</Button></> : <p className="py-16 text-center text-sm text-ink-muted">Your draft appears here. It only uses facts from your verified resume.</p>}</Card>
        </div>
      )}
    </div>
  );
}

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <Suspense><ResumeDetail id={id} /></Suspense>;
}
