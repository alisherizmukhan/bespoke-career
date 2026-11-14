"use client";

import { useState } from "react";
import { AuthLayout } from "@/components/auth-forms";
import { Button, Field, InlineError, Input } from "@/components/ui";
import { api } from "@/lib/api";

export default function Page() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  return (
    <AuthLayout title="Reset your password" subtitle="We'll email you a link to set a new one.">
      {sent ? <p className="rounded-md bg-success-soft px-4 py-3 text-sm text-success">If an account exists for {email}, a reset link is on its way. It works for 1 hour.</p> : (
        <form className="space-y-4" onSubmit={async (e) => { e.preventDefault(); setBusy(true); setErr(null); try { await api("/auth/forgot-password", { body: { email } }); setSent(true); } catch (x) { setErr(x); } finally { setBusy(false); } }}>
          <Field label="Email" id="email"><Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
          <InlineError error={err} />
          <Button type="submit" loading={busy} className="w-full" size="lg">Send reset link</Button>
        </form>
      )}
    </AuthLayout>
  );
}
