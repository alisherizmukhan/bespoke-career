import Link from "next/link";
import { CONTACT_EMAIL, LegalPage, UL } from "@/components/legal";

export const metadata = { title: "Terms of Service" };

export default function Page() {
  return (
    <LegalPage
      title="Terms of Service"
      intro={<>These terms are the agreement between you and Bespoke for using the website, the app and the API. By creating an account or using Bespoke you agree to them. Please also read our <Link href="/privacy" className="link">Privacy Policy</Link>.</>}
      sections={[
        { id: "service", title: "The service", body: <p>Bespoke helps you look for work in the United States. It includes a job board built from public postings, resume upload, parsing, generation and ATS-style analysis, salary research and personal estimates, an application tracker with interviews and reminders, and an AI career assistant. Features depend on your plan and may change as we improve the product.</p> },
        { id: "eligibility", title: "Who can use Bespoke", body: <UL>
          <li>You must be at least 13 years old. If you are under 18, you need permission from a parent or guardian.</li>
          <li>You must give accurate account information and keep it up to date.</li>
          <li>One person per account. Family plans let you add separate profiles for family members or students, each with their own private data.</li>
        </UL> },
        { id: "account", title: "Your account", body: <p>You are responsible for keeping your password safe and for activity under your account. Tell us right away if you think someone else has accessed it. Changing your password signs out all your other sessions.</p> },
        { id: "content", title: "Your content", body: <>
          <p>You own the resumes, profile details, notes and other content you add. You give Bespoke a limited license to store, process and display that content only to provide the service to you, including sending relevant parts to our AI provider when AI features are on.</p>
          <p><b className="font-medium text-ink">Accuracy is your responsibility.</b> Bespoke is built not to invent experience, but you must review every resume, cover letter and message before you use it and make sure everything in it is true. Do not use Bespoke to misrepresent your qualifications to an employer.</p>
        </> },
        { id: "ai", title: "AI features and estimates", body: <UL>
          <li>AI output is generated automatically and can be incomplete or wrong. It is not professional, legal, immigration, tax or financial advice.</li>
          <li>Resume scores are internal diagnostics, not the result of any employer’s applicant tracking system.</li>
          <li>Salary figures are estimates based on advertised pay in public postings. They are not offers, promises or guarantees of what you will earn.</li>
          <li>Bespoke does not guarantee interviews, job offers or any particular outcome.</li>
        </UL> },
        { id: "jobs", title: "Job listings", body: <p>Listings come from third-party employers and job boards. We don’t employ the people who post them, we don’t verify every detail, and applying happens on the employer’s or job board’s own site under their terms. If a listing looks fraudulent, email us and we will review and remove it.</p> },
        { id: "billing", title: "Plans, payments and renewals", body: <>
          <UL>
            <li>The Free plan costs nothing and has monthly limits. Paid plans (Career Plus, Career Pro, Career Family) are billed monthly or yearly in US dollars, at the price shown before you pay.</li>
            <li>Payments are processed by Stripe. By subscribing you authorize recurring charges to your payment method at the start of each billing period until you cancel.</li>
            <li>Paid plans renew automatically. You can cancel at any time from Plan & billing; you keep access until the end of the period you already paid for and then move to Free. We don’t charge cancellation fees.</li>
            <li>Upgrades take effect immediately and Stripe charges the prorated difference. Switching from monthly to yearly starts a new yearly period.</li>
            <li>Except where the law requires otherwise, payments are not refundable for partial periods. If something went wrong with a charge, contact us within 30 days and we will make it right.</li>
            <li>We may change prices for future periods. We will tell you at least 30 days before a new price applies to your subscription, and you can cancel before then.</li>
            <li>Monthly limits reset on the first day of each calendar month and unused allowances don’t carry over.</li>
          </UL>
          <p>While Bespoke runs in test mode, checkout does not charge real money; the app shows clearly when that is the case.</p>
        </> },
        { id: "use", title: "Acceptable use", body: <>
          <p>Do not:</p>
          <UL>
            <li>break the law, infringe others’ rights, or upload content you don’t have the right to share;</li>
            <li>try to access another user’s data, probe for vulnerabilities, bypass plan limits or rate limits, or interfere with the service;</li>
            <li>attempt to manipulate the AI into ignoring its instructions, revealing internal configuration or producing harmful content;</li>
            <li>scrape, copy or resell the job board, salary data or other parts of Bespoke, or access it with automated tools except our public API as documented;</li>
            <li>use Bespoke to send spam, harass anyone or create misleading applications.</li>
          </UL>
          <p>We may suspend or close accounts that break these rules.</p>
        </> },
        { id: "ip", title: "Our intellectual property", body: <p>Bespoke’s software, design, brand and compiled datasets belong to us or our licensors. These terms give you a personal, non-transferable right to use Bespoke; they don’t transfer any ownership to you.</p> },
        { id: "termination", title: "Ending your account", body: <p>You can delete your account at any time in Settings; this ends any paid plan and deletes your data as described in the Privacy Policy. We may suspend or end accounts that violate these terms or the law, or if we stop offering the service, and will give notice where reasonable. Sections that by their nature should survive (such as payment obligations already incurred, disclaimers and limits of liability) continue after termination.</p> },
        { id: "disclaimers", title: "Disclaimers", body: <p>Bespoke is provided “as is” and “as available”. To the extent permitted by law, we disclaim all warranties, express or implied, including merchantability, fitness for a particular purpose and non-infringement. We don’t promise that the service will be uninterrupted, error-free or that job, salary or AI information will be accurate or complete.</p> },
        { id: "liability", title: "Limitation of liability", body: <p>To the extent permitted by law, Bespoke will not be liable for indirect, incidental, special, consequential or punitive damages, or for lost profits, wages, opportunities or data. Our total liability for any claim related to the service is limited to the amount you paid us in the 12 months before the claim, or $50 if you haven’t paid anything. Some jurisdictions don’t allow these limits, so they may not apply to you.</p> },
        { id: "indemnity", title: "Indemnity", body: <p>If you misuse Bespoke or break these terms and that leads to a claim against us, you agree to cover the reasonable costs of that claim, to the extent permitted by law.</p> },
        { id: "law", title: "Governing law and disputes", body: <p>These terms are governed by the laws of the United States and the State of Delaware, without regard to conflict-of-law rules. Before filing a claim, contact us so we can try to resolve the issue informally within 60 days. Nothing here limits rights you have under consumer protection laws where you live.</p> },
        { id: "changes", title: "Changes to these terms", body: <p>We may update these terms. We will change the date at the top and, for material changes, notify you in the app or by email before they take effect. Continuing to use Bespoke after that means you accept the new terms; if you don’t, you can delete your account.</p> },
        { id: "contact", title: "Contact", body: <p>Questions about these terms: <a className="link" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.</p> },
      ]}
    />
  );
}
