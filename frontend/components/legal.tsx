import Link from "next/link";
import { PublicShell } from "./public";

export const LEGAL_UPDATED = "November 15, 2026";
export const CONTACT_EMAIL = "privacy@bespoke.app";

export type Section = { id: string; title: string; body: React.ReactNode };

/** Shared layout for the Privacy Policy and Terms: contents on the left, numbered sections on the right. */
export function LegalPage({ title, intro, sections }: { title: string; intro: React.ReactNode; sections: Section[] }) {
  return (
    <PublicShell>
      <div className="mx-auto max-w-content px-4 py-14 sm:px-6">
        <p className="eyebrow">Last updated {LEGAL_UPDATED}</p>
        <h1 className="h-display mt-3 text-[40px] leading-tight sm:text-[52px]">{title}</h1>
        <div className="mt-4 max-w-3xl text-[17px] leading-7 text-ink-muted">{intro}</div>
        <div className="mt-12 grid gap-10 lg:grid-cols-[240px_1fr]">
          <nav aria-label="Contents" className="hidden lg:block">
            <ol className="sticky top-24 space-y-2 text-[14px]">
              {sections.map((s, i) => (
                <li key={s.id}><a href={`#${s.id}`} className="text-ink-muted hover:text-ink"><span className="tabular mr-2 font-mono text-[12px] text-ink-faint">{String(i + 1).padStart(2, "0")}</span>{s.title}</a></li>
              ))}
            </ol>
          </nav>
          <article className="max-w-3xl space-y-10 text-[15px] leading-7 text-ink">
            {sections.map((s, i) => (
              <section key={s.id} id={s.id} className="scroll-mt-24">
                <h2 className="text-[20px] font-semibold"><span className="tabular mr-3 font-mono text-[14px] font-normal text-ink-faint">{String(i + 1).padStart(2, "0")}</span>{s.title}</h2>
                <div className="legal mt-3 space-y-3 text-ink-muted">{s.body}</div>
              </section>
            ))}
            <p className="border-t border-line pt-6 text-[14px] text-ink-muted">
              See also: <Link href="/privacy" className="link">Privacy Policy</Link> · <Link href="/terms" className="link">Terms of Service</Link>. Questions: <a className="link" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
            </p>
          </article>
        </div>
      </div>
    </PublicShell>
  );
}

export const UL = ({ children }: { children: React.ReactNode }) => <ul className="list-disc space-y-1.5 pl-5">{children}</ul>;
