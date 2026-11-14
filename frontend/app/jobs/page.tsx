import { Suspense } from "react";
import { JobBoard } from "@/components/jobs";
import { PublicShell } from "@/components/public";

export const metadata = { title: "Jobs" };
export default function Page() {
  return (
    <PublicShell>
      <section className="border-b border-line bg-lavender-50">
        <div className="mx-auto max-w-content px-4 pb-16 pt-12 sm:px-6">
          <p className="eyebrow">Updated hourly from company career sites and job APIs</p>
          <h1 className="h-display mt-3 text-[40px] leading-[1.08] sm:text-[56px]">Open jobs across the US</h1>
          <p className="mt-2 max-w-2xl text-ink-muted">Jobs from company career sites and public job APIs, with salary when the employer discloses it. Every listing links to the original posting.</p>
          <div className="mt-8"><Suspense><JobBoard base="/jobs" /></Suspense></div>
        </div>
      </section>
    </PublicShell>
  );
}
