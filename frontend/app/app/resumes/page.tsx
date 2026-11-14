"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, FileUp, Loader2, UserRound } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useRef, useState } from "react";
import { Badge, Button, Card, EmptyState, ErrorState, InlineError, LoadingCards, PageHeader, ScoreRing, cx } from "@/components/ui";
import { api } from "@/lib/api";
import { date } from "@/lib/format";

function Resumes() {
  const router = useRouter();
  const sp = useSearchParams();
  const qc = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const carry = sp.get("jd") ? `?job=${sp.get("jd")}` : sp.get("application") ? `?application=${sp.get("application")}` : "";
  const q = useQuery({ queryKey: ["resume-history"], queryFn: () => api("/resume-intelligence/history") });
  const upload = useMutation({
    mutationFn: (file: File) => { const f = new FormData(); f.append("file", file); return api("/resume-intelligence/upload", { form: f }); },
    onSuccess: (r) => { qc.invalidateQueries({ queryKey: ["resume-history"] }); router.push(`/app/resumes/${r.id}${carry}`); },
  });
  const fromProfile = useMutation({
    mutationFn: () => api("/resumes/from-profile", { body: { title: "Resume from my profile" } }),
    onSuccess: (r) => router.push(`/app/resumes/${r.id}${carry}`),
  });
  const pick = (files: FileList | null) => files?.[0] && upload.mutate(files[0]);

  return (
    <div>
      <PageHeader title="Resume Intelligence" subtitle="Upload, verify, tailor and check your resume against real job descriptions." />
      <div className="grid gap-5 lg:grid-cols-[1.3fr_1fr]">
        <div onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={(e) => { e.preventDefault(); setOver(false); pick(e.dataTransfer.files); }}
          className={cx("flex flex-col items-center justify-center rounded-lg border-2 border-dashed bg-white px-6 py-10 text-center transition-colors", over ? "border-violet-600 bg-violet-100" : "border-violet-200")}>
          <span className="grid h-14 w-14 place-items-center rounded-full bg-violet-100 text-violet-600">{upload.isPending ? <Loader2 className="h-6 w-6 animate-spin" /> : <FileUp className="h-6 w-6" />}</span>
          <p className="mt-4 font-semibold">{upload.isPending ? "Reading your resume…" : "Drop your resume here"}</p>
          <p className="mt-1 text-sm text-ink-muted">PDF or DOCX, up to 10 MB. We keep your original file privately.</p>
          <Button className="mt-5" onClick={() => input.current?.click()} disabled={upload.isPending}>Choose file</Button>
          <input ref={input} type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" className="hidden" onChange={(e) => pick(e.target.files)} />
          <div className="mt-4 w-full max-w-md"><InlineError error={upload.error} /></div>
        </div>
        <Card className="flex flex-col justify-center">
          <span className="grid h-12 w-12 place-items-center rounded-full bg-violet-100 text-violet-600"><UserRound className="h-6 w-6" /></span>
          <p className="mt-4 font-semibold">No resume yet?</p>
          <p className="mt-1 text-sm text-ink-muted">Start from your career profile. Works for students and first jobs too — add projects, coursework and activities.</p>
          <Button className="mt-4 self-start" variant="secondary" loading={fromProfile.isPending} onClick={() => fromProfile.mutate()}>Start from my profile</Button>
          <InlineError error={fromProfile.error} />
        </Card>
      </div>

      <h2 className="mb-3 mt-8 text-lg font-semibold">Your resumes</h2>
      {q.isLoading ? <LoadingCards /> : q.isError ? <ErrorState error={q.error} retry={() => q.refetch()} /> : !q.data.length ? (
        <EmptyState icon={FileText} title="No resumes yet" body="Upload one above to get your first score." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {q.data.map((r: any) => (
            <button key={r.id} onClick={() => router.push(`/app/resumes/${r.id}${carry}`)} className="card flex items-center gap-4 p-5 text-left hover:shadow-card">
              {r.last_score != null ? <ScoreRing score={r.last_score} size={64} /> : <span className="grid h-16 w-16 place-items-center rounded-full bg-lavender-100 text-violet-600"><FileText className="h-6 w-6" /></span>}
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{r.title}</p>
                <p className="text-sm text-ink-muted">{r.document_type_name || "Resume"} · {r.version_count} version{r.version_count === 1 ? "" : "s"} · updated {date(r.updated_at)}</p>
                <div className="mt-2">{r.status === "parsed" ? <Badge tone="warning">Needs your review</Badge> : r.status === "verified" ? <Badge tone="success">Verified</Badge> : <Badge tone="neutral">Draft</Badge>}</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Page() {
  return <Suspense><Resumes /></Suspense>;
}
