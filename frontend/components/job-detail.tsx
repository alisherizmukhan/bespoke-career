"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Bookmark, BookmarkCheck, Building2, Clock, ExternalLink, KanbanSquare, MapPin, Wallet } from "@/components/icons";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { ago, salaryLabel, titleCase } from "@/lib/format";
import { CompanyAvatar, JobCard } from "./jobs";
import { Badge, Button, ErrorState, InlineError, Skeleton } from "./ui";

export function JobDetail({ id, base }: { id: string; base: string }) {
  const { user } = useAuth();
  const router = useRouter();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["job", id], queryFn: () => api(`/jobs/${id}`) });
  const track = useMutation({
    mutationFn: () => api("/applications", { body: { job_id: id, status: "interested" } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["job", id] }); qc.invalidateQueries({ queryKey: ["applications"] }); },
  });
  const save = useMutation({
    mutationFn: () => api(`/jobs/${id}/save`, { method: q.data?.saved ? "DELETE" : "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["job", id] }),
  });
  const needLogin = () => router.push(`/login?next=${encodeURIComponent(`${base}/${id}`)}`);

  if (q.isLoading) return <div className="space-y-4"><Skeleton className="h-40" /><Skeleton className="h-96" /></div>;
  if (q.isError) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  const j = q.data;
  const sal = salaryLabel(j);
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="space-y-5">
        <Link href={base} className="inline-flex items-center gap-1.5 text-sm font-medium text-violet-700"><ArrowLeft className="h-4 w-4" /> All jobs</Link>
        <div className="card p-6">
          <div className="flex gap-4">
            <CompanyAvatar name={j.company} logo={j.company_logo} size={56} />
            <div className="min-w-0">
              <h1 className="text-2xl font-medium leading-tight">{j.title}</h1>
              <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-muted">
                {j.company && <span className="inline-flex items-center gap-1"><Building2 className="h-4 w-4" />{j.company}</span>}
                {j.location && <span className="inline-flex items-center gap-1"><MapPin className="h-4 w-4" />{j.location}</span>}
                <span className="inline-flex items-center gap-1"><Clock className="h-4 w-4" />{j.published_at ? ago(j.published_at) : "Recently"}</span>
              </p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {sal && <Badge tone="success" dot={false}><Wallet className="h-3 w-3" />{sal}</Badge>}
            {j.work_format && <Badge tone="info" dot={false}>{titleCase(j.work_format)}</Badge>}
            {j.employment_type && <Badge tone="neutral" dot={false}>{titleCase(j.employment_type)}</Badge>}
            {j.seniority && <Badge tone="neutral" dot={false}>{titleCase(j.seniority)}</Badge>}
            {j.category && <Badge tone="neutral" dot={false}>{j.category}</Badge>}
          </div>
        </div>
        <div className="card p-6">
          <h2 className="mb-3 font-medium">About the role</h2>
          {j.description ? <div className="whitespace-pre-line text-body leading-7 text-ink/90">{j.description}</div>
            : <p className="text-sm text-ink-muted">The full description is on the original posting.</p>}
          {j.contacts?.length > 0 && <p className="mt-4 text-sm text-ink-muted">Contacts: {j.contacts.join(", ")}</p>}
        </div>
        {j.similar?.length > 0 && (
          <div>
            <h2 className="mb-3 font-medium">Similar jobs</h2>
            <div className="space-y-3">{j.similar.map((s: any) => <JobCard key={s.id} job={s} base={base} />)}</div>
          </div>
        )}
      </div>
      <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
        <div className="card space-y-3 p-5">
          <Button href={j.url} className="w-full" size="lg">Apply on {j.source} <ExternalLink className="h-4 w-4" /></Button>
          {j.application ? (
            <Button variant="soft" className="w-full" href="/app/tracker"><KanbanSquare className="h-4 w-4" />In your tracker · {titleCase(j.application.status)}</Button>
          ) : (
            <Button variant="secondary" className="w-full" loading={track.isPending} onClick={() => (user ? track.mutate() : needLogin())}>
              <KanbanSquare className="h-4 w-4" />Track this job
            </Button>
          )}
          <Button variant="ghost" className="w-full" onClick={() => (user ? save.mutate() : needLogin())}>
            {j.saved ? <><BookmarkCheck className="h-4 w-4 text-violet-600" />Saved</> : <><Bookmark className="h-4 w-4" />Save for later</>}
          </Button>
          <InlineError error={track.error || save.error} />
        </div>
        <div className="card p-5 text-sm">
          <p className="font-medium">Tailor your resume</p>
          <p className="mt-1 text-ink-muted">Check how your resume matches this job and generate a tailored version.</p>
          <Button variant="soft" size="sm" className="mt-3" href={user ? `/app/resumes?jd=${encodeURIComponent(id)}` : "/register"}>Check my match</Button>
        </div>
        <p className="px-1 text-xs text-ink-muted">Listing via {j.source} ({j.source_name}). Bespoke isn't the employer; apply on the original site.</p>
      </aside>
    </div>
  );
}
