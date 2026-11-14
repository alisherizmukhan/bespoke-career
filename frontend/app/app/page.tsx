"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Bell, Briefcase, CalendarClock, CheckCircle2, Circle, FileText, KanbanSquare, Lightbulb, Trophy, Upload, Wallet } from "@/components/icons";
import Link from "next/link";
import { JobCard } from "@/components/jobs";
import { Button, Card, EmptyState, ErrorState, ScoreRing, Skeleton, StatCard } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { date, money } from "@/lib/format";

export default function Dashboard() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["dashboard"], queryFn: () => api("/dashboard") });
  const done = useMutation({ mutationFn: (id: string) => api(`/reminders/${id}?done=true`, { method: "PATCH" }), onSuccess: () => qc.invalidateQueries({ queryKey: ["dashboard"] }) });
  if (q.isLoading) return <div className="space-y-5"><Skeleton className="h-24" /><div className="grid gap-4 md:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28" />)}</div><Skeleton className="h-64" /></div>;
  if (q.isError) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  const d = q.data;
  const today = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-mono text-[12px] text-ink-faint">{today}</p>
          <h1 className="h-display mt-1 text-[32px] leading-[1.1] sm:text-[40px]">Dashboard</h1>
          <p className="mt-1 text-[15px] text-ink-muted">
            {d.profile.target_title ? <>Target role: <span className="text-ink">{d.profile.target_title}</span>{d.profile.title ? <> · now {d.profile.title}</> : null}</> : "Set a target role to get sharper recommendations"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button href="/app/resumes" size="sm" variant="secondary"><Upload className="h-4 w-4" />Check a resume</Button>
          <Button href="/app/jobs" size="sm"><Briefcase className="h-4 w-4" />Find jobs</Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={KanbanSquare} label="Active applications" value={d.applications.active} sub={`${d.applications.total} tracked in total`} />
        <StatCard icon={CalendarClock} label="Upcoming interviews" value={d.upcoming_interviews.length} sub={d.upcoming_interviews[0] ? date(d.upcoming_interviews[0].scheduled_at, true) : "None scheduled"} tone="warning" />
        <StatCard icon={FileText} label="Resume score" value={d.resume.last_score ?? "—"} sub={d.resume.count ? `${d.resume.count} resume${d.resume.count > 1 ? "s" : ""}` : "Upload to get a score"} />
        <StatCard icon={Wallet} label="Salary estimate" value={d.salary ? money(d.salary.mid, { compact: true }) : "—"} sub={d.salary ? `${money(d.salary.low, { compact: true })}–${money(d.salary.high, { compact: true })} · ${d.salary.confidence} confidence` : "Run an assessment"} tone="success" />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <div className="mb-4 flex items-center gap-2"><Lightbulb className="h-5 w-5 text-violet-600" /><h2 className="text-lg font-medium">Recommended next steps</h2></div>
          {d.recommendations.length ? (
            <ul className="divide-y divide-line">
              {d.recommendations.map((r: any, i: number) => (
                <li key={i}><Link href={r.link} className="group flex items-start gap-3 py-3.5">
                  <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-violet-100 text-violet-600"><ArrowRight className="h-4 w-4" /></span>
                  <span className="flex-1"><span className="block text-[15px] font-medium group-hover:text-violet-700">{r.title}</span><span className="text-sm text-ink-muted">{r.body}</span></span>
                </Link></li>
              ))}
            </ul>
          ) : <EmptyState icon={CheckCircle2} title="You're on track" body="No urgent actions. Keep applying and check back after updates." />}
        </Card>
        <div className="space-y-6">
          <Card>
            <div className="mb-3 flex items-center justify-between"><h2 className="font-medium">Upcoming interviews</h2><Link href="/app/tracker" className="link text-sm">Tracker</Link></div>
            {d.upcoming_interviews.length ? d.upcoming_interviews.map((i: any) => (
              <div key={i.id} className="flex items-center gap-3 border-b border-line py-2.5 last:border-0">
                <span className="grid h-10 w-10 place-items-center rounded-md bg-warning-soft text-warning"><Trophy className="h-4 w-4" /></span>
                <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{i.company} · {i.title}</p><p className="text-xs text-ink-muted">{date(i.scheduled_at, true)} · {i.type}</p></div>
                {i.meeting_url && <a href={i.meeting_url} target="_blank" rel="noopener noreferrer" className="link text-xs">Join</a>}
              </div>
            )) : <p className="py-4 text-sm text-ink-muted">No interviews scheduled yet.</p>}
          </Card>
          <Card>
            <div className="mb-3 flex items-center gap-2"><Bell className="h-4 w-4 text-violet-600" /><h2 className="font-medium">Reminders</h2></div>
            {d.reminders.length ? d.reminders.map((r: any) => (
              <button key={r.id} onClick={() => done.mutate(r.id)} className="flex w-full items-start gap-2.5 rounded-md py-2 text-left hover:bg-lavender-50">
                <Circle className="mt-0.5 h-4 w-4 shrink-0 text-violet-400" />
                <span className="flex-1 text-sm">{r.title}<span className="block text-xs text-ink-muted">{date(r.due_at, true)}</span></span>
              </button>
            )) : <p className="py-3 text-sm text-ink-muted">Nothing due. Reminders appear when you apply or schedule interviews.</p>}
          </Card>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div>
          <div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-medium">Jobs matching your target</h2><Link href="/app/jobs" className="link text-sm">See all</Link></div>
          {d.matching_jobs.length ? <div className="space-y-3">{d.matching_jobs.map((j: any) => <JobCard key={j.id} job={j} base="/app/jobs" />)}</div>
            : <EmptyState icon={Briefcase} title="Add a target job title" body="We'll match live openings to it." action={<Button href="/app/profile" size="sm">Edit profile</Button>} />}
        </div>
        <Card>
          <div className="flex items-center justify-between"><h2 className="font-medium">{d.usage.plan.name} plan</h2><Link href="/app/billing" className="link text-sm">Upgrade</Link></div>
          <p className="mb-4 text-xs text-ink-muted">Usage this month</p>
          <div className="space-y-3.5">
            {["resume_generation", "resume_analysis", "applications", "assistant_messages", "salary_assessment"].map((k) => {
              const f = d.usage.features[k];
              const pct = f.unlimited ? 8 : f.limit ? Math.min(100, (100 * f.used) / f.limit) : 100;
              return (
                <div key={k}>
                  <div className="flex justify-between text-[13px]"><span>{f.label}</span><span className="tabular text-ink-muted">{f.used} / {f.unlimited ? "∞" : f.limit}</span></div>
                  <div className="mt-1 h-1.5 rounded-full bg-violet-100"><div className={`h-1.5 rounded-full ${pct >= 100 ? "bg-warning" : "bg-violet-600"}`} style={{ width: `${pct}%` }} /></div>
                </div>
              );
            })}
          </div>
          {d.resume.last_score != null && <div className="mt-6 flex items-center gap-4 rounded-lg bg-lavender-50 p-4"><ScoreRing score={d.resume.last_score} size={72} /><p className="text-sm text-ink-muted">Your latest resume score. Analyze against a job description to raise it.</p></div>}
        </Card>
      </div>
    </div>
  );
}
