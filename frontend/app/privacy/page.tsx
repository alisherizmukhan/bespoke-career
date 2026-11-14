import { PublicShell } from "@/components/public";

export const metadata = { title: "Privacy Policy" };
export default function Page() {
  return (
    <PublicShell>
      <article className="mx-auto max-w-3xl px-4 py-14 text-[15px] leading-7 text-ink/90 sm:px-6">
        <h1 className="h-display mb-6 text-4xl">Privacy Policy</h1>
        <p className="mb-4 rounded-md bg-warning-soft px-4 py-3 text-sm text-warning">Draft for the MVP. This text has not been reviewed by a lawyer and must be finalized before launch.</p>
        <p className="mb-4">Bespoke stores the profile, resumes, applications and assistant conversations you create so we can provide the service. Uploaded files are kept in private storage and are only reachable through short-lived signed links.</p><p className="mb-4">When AI features are on, the relevant parts of your data are sent to our AI provider (OpenAI) to generate answers; you can turn AI processing off in Settings. We do not sell personal data.</p><p className="mb-4">You can export all of your data or delete your account at any time from Settings. Family members never see each other’s resumes, applications or conversations without explicit consent.</p>
      </article>
    </PublicShell>
  );
}
