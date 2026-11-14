"use client";

import { useQuery } from "@tanstack/react-query";
import { Bookmark } from "lucide-react";
import { Suspense, useState } from "react";
import { JobBoard, JobCard } from "@/components/jobs";
import { EmptyState, LoadingCards, PageHeader, Tabs } from "@/components/ui";
import { api } from "@/lib/api";

function Saved() {
  const q = useQuery({ queryKey: ["saved-jobs"], queryFn: () => api("/jobs/saved") });
  if (q.isLoading) return <LoadingCards />;
  if (!q.data?.length) return <EmptyState icon={Bookmark} title="No saved jobs yet" body="Tap the bookmark on any job to keep it here." />;
  return <div className="space-y-3">{q.data.map((j: any) => <JobCard key={j.id} job={j} base="/app/jobs" />)}</div>;
}

export default function Jobs() {
  const [tab, setTab] = useState<"all" | "saved">("all");
  return (
    <div>
      <PageHeader title="Jobs" subtitle="Live US openings from company career sites and public job APIs." actions={<Tabs value={tab} onChange={setTab} items={[{ value: "all", label: "All jobs" }, { value: "saved", label: "Saved" }]} />} />
      {tab === "all" ? <Suspense><JobBoard base="/app/jobs" /></Suspense> : <Saved />}
    </div>
  );
}
