"use client";

import { use } from "react";
import { JobDetail } from "@/components/job-detail";

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <JobDetail id={id} base="/app/jobs" />;
}
