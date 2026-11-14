import { Suspense } from "react";
import { JobBoard } from "@/components/jobs";
import { PublicShell } from "@/components/public";

export const metadata = { title: "Jobs" };
export default function Page() {
  return (
    <PublicShell>
      <section className="bg-gradient-to-b from-lavender-100 to-lavender-50">
        <div className="mx-auto max-w-content px-4 pb-16 pt-10 sm:px-6">
          <span className="eyebrow">Live openings · updated hourly</span>
          <h1 className="h-display mt-4 text-[36px] leading-tight sm:text-[48px]">Find your next role <span className="text-violet-600">across the US.</span></h1>
          <p className="mt-2 max-w-2xl text-ink-muted">Jobs from company career sites and public job APIs, with salary when the employer discloses it. Every listing links to the original posting.</p>
          <div className="mt-8"><Suspense><JobBoard base="/jobs" /></Suspense></div>
        </div>
      </section>
    </PublicShell>
  );
}
