"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { AuthLayout } from "@/components/auth-forms";
import { Button, Field, InlineError, Input } from "@/components/ui";
import { api } from "@/lib/api";

function Reset() {
  const sp = useSearchParams();
  const router = useRouter();
  const [pw, setPw] = useState("");
  const [err, setErr] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  return (
    <form className="space-y-4" onSubmit={async (e) => { e.preventDefault(); setBusy(true); setErr(null); try { await api("/auth/reset-password", { body: { token: sp.get("token"), password: pw } }); router.push("/login"); } catch (x) { setErr(x); } finally { setBusy(false); } }}>
      <Field label="New password" id="pw" hint="At least 8 characters with letters and numbers."><Input id="pw" type="password" required value={pw} onChange={(e) => setPw(e.target.value)} /></Field>
      <InlineError error={err} />
      <Button type="submit" loading={busy} className="w-full" size="lg">Set new password</Button>
    </form>
  );
}
export default function Page() {
  return <AuthLayout title="Choose a new password"><Suspense><Reset /></Suspense></AuthLayout>;
}
