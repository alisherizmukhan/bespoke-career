import { PublicShell } from "@/components/public";

export const metadata = { title: "Terms of Service" };
export default function Page() {
  return (
    <PublicShell>
      <article className="mx-auto max-w-3xl px-4 py-14 text-[15px] leading-7 text-ink/90 sm:px-6">
        <h1 className="h-display mb-6 text-4xl">Terms of Service</h1>
        <p className="mb-4 rounded-md bg-warning-soft px-4 py-3 text-sm text-warning">Draft for the MVP. This text has not been reviewed by a lawyer and must be finalized before launch.</p>
        <p className="mb-4">Bespoke provides career tools for informational purposes. Salary figures are estimates from public job postings and are not offers or guarantees. Resume scores are internal diagnostics, not employer ATS results.</p><p className="mb-4">You are responsible for the accuracy of the information you add. Job listings belong to their original publishers; apply on the original site.</p><p className="mb-4">Paid plans renew until cancelled. During the MVP, billing runs in test mode and no real payments are processed.</p>
      </article>
    </PublicShell>
  );
}
