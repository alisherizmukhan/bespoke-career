"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bookmark, BookmarkCheck, Briefcase, Building2, Clock, ExternalLink, MapPin, Search, SlidersHorizontal, Wallet } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { ago, salaryLabel, titleCase } from "@/lib/format";
import { Badge, Button, EmptyState, ErrorState, Input, LoadingCards, Select, cx } from "./ui";

export type Job = {
  id: string; title: string; company: string | null; company_logo: string | null; location: string | null;
  salary_min: number | null; salary_max: number | null; salary_period: string | null; currency: string | null;
  employment_type: string | null; work_format: string | null; seniority: string | null; category: string | null;
  url: string; source: string; source_kind: string; source_name: string; published_at: string | null; snippet?: string; saved: boolean;
};

export function CompanyAvatar({ name, logo, size = 44 }: { name: string | null; logo?: string | null; size?: number }) {
  const [broken, setBroken] = useState(false);
  const initials = (name || "?").split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  if (logo && !broken)
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={logo} alt="" width={size} height={size} onError={() => setBroken(true)} className="shrink-0 rounded-md border border-line bg-white object-contain p-1" style={{ width: size, height: size }} />;
  return <span className="grid shrink-0 place-items-center rounded-md bg-violet-100 text-sm font-bold text-violet-700" style={{ width: size, height: size }}>{initials}</span>;
}

export function JobCard({ job, base = "/jobs", onSave }: { job: Job; base?: string; onSave?: (j: Job) => void }) {
  const sal = salaryLabel(job);
  return (
    <article className="card group flex gap-4 p-4 transition-shadow hover:shadow-card sm:p-5">
      <CompanyAvatar name={job.company} logo={job.company_logo} />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Link href={`${base}/${job.id}`} className="line-clamp-2 text-[15px] font-semibold text-ink hover:text-violet-700">{job.title}</Link>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-ink-muted">
              {job.company && <span className="inline-flex items-center gap-1"><Building2 className="h-3.5 w-3.5" />{job.company}</span>}
              {job.location && <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{job.location}</span>}
            </p>
          </div>
          {onSave && (
            <button onClick={() => onSave(job)} className="rounded-md p-1.5 text-ink-muted hover:bg-lavender-100 hover:text-violet-700" aria-label={job.saved ? "Remove from saved" : "Save job"}>
              {job.saved ? <BookmarkCheck className="h-5 w-5 text-violet-600" /> : <Bookmark className="h-5 w-5" />}
            </button>
          )}
        </div>
        {job.snippet && <p className="mt-2 line-clamp-2 text-[13px] leading-5 text-ink-muted">{job.snippet}</p>}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {sal && <Badge tone="success" dot={false}><Wallet className="h-3 w-3" />{sal}</Badge>}
          {job.work_format && <Badge tone="info" dot={false}>{titleCase(job.work_format)}</Badge>}
          {job.employment_type && <Badge tone="neutral" dot={false}>{titleCase(job.employment_type)}</Badge>}
          {job.seniority && <Badge tone="neutral" dot={false}>{titleCase(job.seniority)}</Badge>}
          <span className="ml-auto inline-flex items-center gap-1 text-xs text-ink-muted">
            <Clock className="h-3 w-3" />{job.published_at ? ago(job.published_at) : "recently"} · via {job.source}
          </span>
        </div>
      </div>
    </article>
  );
}

const SENIORITY = ["intern", "entry", "mid", "senior", "lead", "executive"];
const TYPES = ["full-time", "part-time", "contract", "internship"];

export function JobBoard({ base = "/jobs" }: { base?: string }) {
  const router = useRouter();
  const sp = useSearchParams();
  const qc = useQueryClient();
  const { user } = useAuth();
  const [q, setQ] = useState(sp.get("q") || "");
  const [loc, setLoc] = useState(sp.get("location") || "");
  const [showFilters, setShowFilters] = useState(false);
  const params = new URLSearchParams(sp.toString());
  const page = Number(params.get("page") || 1);

  useEffect(() => {
    setQ(sp.get("q") || "");
    setLoc(sp.get("location") || "");
  }, [sp]);

  const set = (k: string, v: string | null) => {
    const p = new URLSearchParams(sp.toString());
    if (v) p.set(k, v);
    else p.delete(k);
    if (k !== "page") p.delete("page");
    router.push(`${base}?${p.toString()}`, { scroll: k === "page" });
  };

  const facets = useQuery({ queryKey: ["facets"], queryFn: () => api("/jobs/facets") });
  const res = useQuery({
    queryKey: ["jobs", params.toString()],
    queryFn: () => api<{ items: Job[]; total: number; per_page: number; external_search: { name: string; url: string }[] }>(`/jobs?${params.toString()}`),
    placeholderData: keepPreviousData,
  });
  const save = useMutation({
    mutationFn: (j: Job) => api(`/jobs/${j.id}/save`, { method: j.saved ? "DELETE" : "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["jobs"] }),
  });

  const onSave = (j: Job) => (user ? save.mutate(j) : router.push(`/login?next=${encodeURIComponent(base)}`));
  const pages = res.data ? Math.ceil(res.data.total / res.data.per_page) : 1;

  return (
    <div>
      <form onSubmit={(e) => { e.preventDefault(); const p = new URLSearchParams(sp.toString()); q ? p.set("q", q) : p.delete("q"); loc ? p.set("location", loc) : p.delete("location"); p.delete("page"); router.push(`${base}?${p}`); }}
        className="card flex flex-col gap-2 p-2 sm:flex-row">
        <label className="relative flex-1">
          <span className="sr-only">Job title, keyword or company</span>
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Job title, keyword or company" className="border-0 pl-10 focus:ring-0" />
        </label>
        <label className="relative flex-1 sm:max-w-[260px]">
          <span className="sr-only">City or state</span>
          <MapPin className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
          <Input value={loc} onChange={(e) => setLoc(e.target.value)} placeholder="City, state or “Remote”" className="border-0 pl-10 focus:ring-0 sm:border-l sm:border-line" />
        </label>
        <Button type="submit" size="lg">Search jobs</Button>
      </form>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button onClick={() => setShowFilters(!showFilters)} className="inline-flex items-center gap-1.5 rounded-full border border-violet-200 bg-white px-3 py-1.5 text-[13px] font-semibold text-violet-700 lg:hidden">
          <SlidersHorizontal className="h-4 w-4" /> Filters
        </button>
        {[["remote", "Remote"], ["with_salary", "Shows salary"]].map(([k, l]) => (
          <button key={k} onClick={() => set(k, params.get(k) ? null : "true")}
            className={cx("rounded-full border px-3 py-1.5 text-[13px] font-semibold", params.get(k) ? "border-violet-600 bg-violet-600 text-white" : "border-violet-200 bg-white text-violet-700 hover:border-violet-400")}>
            {l}
          </button>
        ))}
        {[["posted_days", "1", "Last 24 hours"], ["posted_days", "7", "Past week"]].map(([k, v, l]) => (
          <button key={l} onClick={() => set(k, params.get(k) === v ? null : v)}
            className={cx("rounded-full border px-3 py-1.5 text-[13px] font-semibold", params.get(k) === v ? "border-violet-600 bg-violet-600 text-white" : "border-violet-200 bg-white text-violet-700 hover:border-violet-400")}>
            {l}
          </button>
        ))}
        <Select value={params.get("sort") || "recent"} onChange={(e) => set("sort", e.target.value === "recent" ? null : e.target.value)} className="ml-auto !min-h-[36px] !w-auto py-1 text-[13px]" aria-label="Sort">
          <option value="recent">Most recent</option>
          <option value="salary">Highest salary</option>
        </Select>
      </div>

      <div className="mt-5 grid gap-6 lg:grid-cols-[250px_1fr]">
        <aside className={cx("space-y-5", showFilters ? "block" : "hidden lg:block")}>
          <div className="card p-4">
            <p className="mb-2 text-[13px] font-semibold">Category</p>
            <div className="max-h-[300px] space-y-0.5 overflow-y-auto pr-1">
              {(facets.data?.categories || []).map((c: any) => (
                <button key={c.name} onClick={() => set("category", params.get("category") === c.name ? null : c.name)}
                  className={cx("flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-left text-[13px]", params.get("category") === c.name ? "bg-violet-100 font-semibold text-violet-700" : "text-ink-muted hover:bg-lavender-100")}>
                  <span className="truncate">{c.name}</span><span className="tabular text-xs">{c.count}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="card space-y-3 p-4">
            <label className="block text-[13px] font-semibold">Experience level
              <Select value={params.get("seniority") || ""} onChange={(e) => set("seniority", e.target.value || null)} className="mt-1.5">
                <option value="">Any level</option>
                {SENIORITY.map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}
              </Select>
            </label>
            <label className="block text-[13px] font-semibold">Job type
              <Select value={params.get("employment_type") || ""} onChange={(e) => set("employment_type", e.target.value || null)} className="mt-1.5">
                <option value="">Any type</option>
                {TYPES.map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}
              </Select>
            </label>
            <label className="block text-[13px] font-semibold">Minimum salary
              <Select value={params.get("min_salary") || ""} onChange={(e) => set("min_salary", e.target.value || null)} className="mt-1.5">
                <option value="">Any</option>
                {[50000, 75000, 100000, 150000, 200000].map((v) => <option key={v} value={v}>${v / 1000}k+ / year</option>)}
              </Select>
            </label>
            <label className="block text-[13px] font-semibold">Source
              <Select value={params.get("source") || ""} onChange={(e) => set("source", e.target.value || null)} className="mt-1.5">
                <option value="">All sources</option>
                {(facets.data?.sources || []).map((s: any) => <option key={s.kind} value={s.kind}>{s.name} ({s.count})</option>)}
              </Select>
            </label>
          </div>
          {res.data?.external_search && (
            <div className="card p-4">
              <p className="text-[13px] font-semibold">Search on other boards</p>
              <p className="mb-2 mt-0.5 text-xs text-ink-muted">These sites don't offer public listings to aggregate, so we open the same search there.</p>
              <div className="flex flex-wrap gap-1.5">
                {res.data.external_search.map((l) => (
                  <a key={l.name} href={l.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-full bg-lavender-100 px-2.5 py-1 text-xs font-semibold text-violet-700 hover:bg-violet-100">
                    {l.name}<ExternalLink className="h-3 w-3" />
                  </a>
                ))}
              </div>
            </div>
          )}
        </aside>

        <section aria-live="polite">
          <p className="mb-3 text-[13px] text-ink-muted">
            {res.data ? <><span className="tabular font-semibold text-ink">{res.data.total.toLocaleString()}</span> jobs{params.get("q") ? ` for “${params.get("q")}”` : ""}</> : "Loading jobs…"}
          </p>
          {res.isLoading ? <LoadingCards n={5} /> : res.isError ? <ErrorState error={res.error} retry={() => res.refetch()} /> :
            !res.data?.items.length ? (
              <EmptyState icon={Briefcase} title="No jobs match these filters" body="Try a broader title, remove a filter, or search the other boards on the left."
                action={<Button variant="secondary" onClick={() => router.push(base)}>Clear filters</Button>} />
            ) : (
              <div className={cx("space-y-3 transition-opacity", res.isFetching && "opacity-60")}>
                {res.data.items.map((j) => <JobCard key={j.id} job={j} base={base} onSave={onSave} />)}
              </div>
            )}
          {pages > 1 && (
            <div className="mt-6 flex items-center justify-center gap-2">
              <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => set("page", String(page - 1))}>Previous</Button>
              <span className="tabular px-2 text-sm text-ink-muted">Page {page} of {pages}</span>
              <Button variant="secondary" size="sm" disabled={page >= pages} onClick={() => set("page", String(page + 1))}>Next</Button>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
