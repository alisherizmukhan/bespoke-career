"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ProfileSections, toPayload } from "@/components/profile-form";
import { Button, Card, ErrorState, InlineError, PageHeader, Skeleton } from "@/components/ui";
import { api } from "@/lib/api";

export default function Profile() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["profile"], queryFn: () => api("/profile") });
  const [data, setData] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  useEffect(() => { if (q.data) setData(q.data); }, [q.data]);
  const set = (k: string, v: any) => { setSaved(false); setData((d: any) => ({ ...d, [k]: v })); };
  if (q.isError) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  if (!data) return <Skeleton className="h-96" />;
  const save = async () => {
    setBusy(true); setErr(null);
    try { const r = await api("/profile", { method: "PATCH", body: toPayload(data) }); qc.setQueryData(["profile"], r); setSaved(true); }
    catch (e) { setErr(e); } finally { setBusy(false); }
  };
  return (
    <div>
      <PageHeader title="Career profile" subtitle="One profile powers your resumes, salary estimates, job matches and the assistant."
        actions={<div className="flex items-center gap-3"><span className="text-sm text-ink-muted">{q.data.completeness}% complete</span><Button loading={busy} onClick={save}>Save changes</Button></div>} />
      <div className="mb-5 h-2 overflow-hidden rounded-full bg-violet-100"><div className="h-2 rounded-full bg-violet-600" style={{ width: `${q.data.completeness}%` }} /></div>
      {saved && <p className="mb-4 rounded-md bg-success-soft px-4 py-2 text-sm text-success">Profile saved.</p>}
      <InlineError error={err} />
      <div className="grid gap-5">
        {([["basics", "About you"], ["work", "Experience"], ["education", "Education & skills"], ["goals", "Goals & salary"], ["links", "Links"]] as const).map(([k, t]) => (
          <Card key={k}><h2 className="mb-5 text-lg font-semibold">{t}</h2><ProfileSections data={data} set={set} sections={[k]} /></Card>
        ))}
      </div>
      <div className="mt-6 flex justify-end"><Button loading={busy} onClick={save} size="lg">Save changes</Button></div>
    </div>
  );
}
