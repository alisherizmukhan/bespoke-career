"use client";

import { use } from "react";
import { JobDetail } from "@/components/job-detail";
import { PublicShell } from "@/components/public";

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <PublicShell>
      <div className="mx-auto max-w-content px-4 py-8 sm:px-6"><JobDetail id={id} base="/jobs" /></div>
    </PublicShell>
  );
}
