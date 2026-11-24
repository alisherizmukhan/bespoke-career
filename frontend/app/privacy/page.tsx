import Link from "next/link";
import { CONTACT_EMAIL, LegalPage, UL } from "@/components/legal";

export const metadata = { title: "Privacy Policy" };

export default function Page() {
  return (
    <LegalPage
      title="Privacy Policy"
      intro={<>This policy explains what Bespoke collects, why, who processes it on our behalf and the choices you have. We collect only what the product needs, we never sell personal data, and you can export or delete everything from Settings.</>}
      sections={[
        { id: "who", title: "Who we are", body: <p>Bespoke is a career platform for job seekers in the United States: a job board built from public postings, resume tools, salary estimates, an application tracker and an AI career assistant. In this policy, “Bespoke”, “we” and “us” mean the team operating YOUR-FRONTEND.vercel.app and its API.</p> },
        { id: "collect", title: "What we collect", body: <>
          <p><b className="font-medium text-ink">Information you give us</b></p>
          <UL>
            <li>Account: name, email address and a password (stored only as a bcrypt hash; we never see or store the password itself).</li>
            <li>Career profile: location, titles, industry, experience, education, skills, goals, target salary and links you choose to add.</li>
            <li>Resumes and documents: files you upload (PDF or DOCX), the text we extract from them and every version you create.</li>
            <li>Job search activity: saved jobs, tracked applications, interviews, reminders, notes and salary assessments.</li>
            <li>Assistant conversations: the messages you send to the AI assistant and its replies.</li>
          </UL>
          <p><b className="font-medium text-ink">Information created when you use Bespoke</b></p>
          <UL>
            <li>Billing records: your plan, billing interval, renewal dates and amounts paid. Card details are entered on Stripe’s page and stored by Stripe, never by Bespoke.</li>
            <li>Security and audit records: sign-ins, password changes, plan changes and admin actions, with time and IP address.</li>
            <li>AI usage metadata: which feature was used, model, token counts and response time. The content of prompts and answers is not stored in these records.</li>
            <li>Monthly usage counters used to apply plan limits.</li>
          </UL>
          <p>We do not use advertising trackers, sell data to data brokers or build advertising profiles.</p>
        </> },
        { id: "use", title: "How we use it", body: <UL>
          <li>To provide the service: show your dashboard, generate and analyze resumes, estimate salary, track applications and answer assistant questions.</li>
          <li>To run subscriptions: apply plan limits, process payments through Stripe and send receipts and plan notices.</li>
          <li>To keep accounts safe: detect abuse, rate-limit sign-in attempts, investigate incidents and keep an audit trail of sensitive actions.</li>
          <li>To support customers: our team can see account, plan and activity information in an internal admin panel. Every admin action and every data export is recorded in the audit log.</li>
          <li>To improve Bespoke using aggregated, non-identifying statistics (for example how many resumes were generated this month).</li>
        </UL> },
        { id: "ai", title: "AI processing", body: <>
          <p>When AI features are on, the parts of your data needed for a task are sent to our AI provider, OpenAI, to produce the result: for example your verified resume and a job description when you generate a tailored resume, or a summary of your applications when you ask the assistant a question.</p>
          <UL>
            <li>OpenAI processes this data as our service provider. OpenAI states that data sent through its API is not used to train its models by default.</li>
            <li>We send only your own records, never another user’s.</li>
            <li>Bespoke is designed to use only facts you provided. Resume generation is checked for claims that don’t appear in your verified data before it is saved.</li>
            <li>You can turn AI processing off at any time in <Link href="/app/settings" className="link">Settings</Link>. Features then fall back to rule-based logic where possible.</li>
          </UL>
          <p>AI output can be wrong. Review anything important before you rely on it or send it to an employer.</p>
        </> },
        { id: "jobs", title: "Job and salary data", body: <p>Job listings and the salary statistics built from them come from public job postings and official job-board APIs (for example company career pages on Greenhouse, Lever and Ashby, and remote-job boards). Postings may contain recruiter names or contact details published by the employer. We show the source of each listing and link to the original posting. Salary figures describe advertised pay ranges, not what any individual is paid.</p> },
        { id: "share", title: "Who we share it with", body: <>
          <p>We share personal data only with service providers that help us run Bespoke, under contracts that limit their use of it to providing their service:</p>
          <UL>
            <li><b className="font-medium text-ink">Railway</b>: hosts the API and the PostgreSQL database (United States).</li>
            <li><b className="font-medium text-ink">Vercel</b>: hosts the website you load in your browser.</li>
            <li><b className="font-medium text-ink">OpenAI</b>: processes AI requests as described above.</li>
            <li><b className="font-medium text-ink">Stripe</b>: processes payments and stores card details.</li>
            <li><b className="font-medium text-ink">GitHub</b>: hosts our source code and runs scheduled health checks; it receives no customer data.</li>
          </UL>
          <p>We may also disclose information if required by law, to protect the rights and safety of our users, or as part of a merger or acquisition, in which case this policy continues to apply. We do not sell or “share” personal information for cross-context behavioral advertising as those terms are defined under California law.</p>
        </> },
        { id: "security", title: "How we protect it", body: <UL>
          <li>All traffic is encrypted with HTTPS (TLS). The database is hosted on a managed provider with encryption at rest.</li>
          <li>Passwords are hashed with bcrypt. Sessions use signed tokens that expire after 7 days and are revoked when you change or reset your password or when an account is suspended.</li>
          <li>Every request is checked against your account: one user can’t read another user’s resumes, applications, files or conversations.</li>
          <li>Uploaded files are kept in private storage and opened only through short-lived signed links (30 minutes).</li>
          <li>Database queries are parameterized; text from users and job sites is sanitized before it’s used in AI prompts, and AI replies are screened for leaked instructions or secrets.</li>
          <li>The website sends strict security headers (Content Security Policy, no framing) and its code contains no secrets. API keys live only in server environment settings.</li>
          <li>Sign-in, registration, password reset and AI features are rate-limited.</li>
        </UL> },
        { id: "retention", title: "How long we keep it", body: <>
          <p>We keep your data while your account is open. When you delete your account we immediately delete your profile, skills, resumes and uploaded files, applications, interviews, reminders, saved jobs, salary assessments, assistant conversations, notifications, usage counters and our internal notes about you, end any paid plan, and replace your email with an anonymous placeholder.</p>
          <p>We keep payment records (amount, date, plan) as required for accounting and tax, and audit-log entries in a form no longer linked to your email. Copies may remain in our hosting providers’ encrypted backups for a limited period before they’re overwritten.</p>
        </> },
        { id: "rights", title: "Your choices and rights", body: <>
          <UL>
            <li><b className="font-medium text-ink">Access and export</b>: download all of your data as a file from Settings.</li>
            <li><b className="font-medium text-ink">Correction</b>: edit your profile, resumes and applications at any time.</li>
            <li><b className="font-medium text-ink">Deletion</b>: delete your account from Settings; this can’t be undone.</li>
            <li><b className="font-medium text-ink">AI opt-out</b>: turn AI processing off in Settings.</li>
            <li><b className="font-medium text-ink">Billing</b>: cancel a paid plan from Plan & billing; update cards and download invoices in the Stripe portal.</li>
          </UL>
          <p>If you live in California or another state with a consumer privacy law, you have the right to know what we collect, to delete it, to correct it, and not to be discriminated against for using these rights. You can use them yourself in Settings or by writing to us. We will verify the request comes from the account holder before acting on it.</p>
        </> },
        { id: "storage", title: "Cookies and browser storage", body: <p>Bespoke does not use advertising or analytics cookies. To keep you signed in, the website stores a session token in your browser’s local storage; signing out removes it. We also remember small conveniences such as the plan you picked before signing up.</p> },
        { id: "children", title: "Children and students", body: <p>Bespoke is not directed to children under 13 and we don’t knowingly collect their data. High-school students aged 13 to 17 may use Bespoke with a parent or guardian’s permission, for example through a Family plan where each member’s profile and documents stay private. If you believe a child under 13 has created an account, contact us and we will delete it.</p> },
        { id: "changes", title: "Changes to this policy", body: <p>If we change this policy we will update the date at the top. For material changes we will notify you in the app or by email before they take effect.</p> },
        { id: "contact", title: "Contact", body: <p>Questions or privacy requests: <a className="link" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>. We aim to respond within 30 days.</p> },
      ]}
    />
  );
}
