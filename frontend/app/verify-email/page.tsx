"use client";

import { MailCheck } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { AuthLayout } from "@/components/auth-forms";
import { Button, InlineError } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";

function Verify() {
  const sp = useSearchParams();
  const router = useRouter();
  const { user, refresh } = useAuth();
  const [state, setState] = useState<"idle" | "verifying" | "done">("idle");
  const [err, setErr] = useState<unknown>(null);
  const [demo, setDemo] = useState<string | null>(null);
  const token = sp.get("token");

  useEffect(() => {
    try { setDemo(sessionStorage.getItem("bespoke_verify")); } catch { /* ignore */ }
  }, []);
  useEffect(() => {
    if (!token) return;
    setState("verifying");
    api("/auth/verify-email", { body: { token } })
      .then(async () => { setState("done"); try { sessionStorage.removeItem("bespoke_verify"); } catch {} await refresh(); })
      .catch((e) => { setErr(e); setState("idle"); });
  }, [token, refresh]);

  if (state === "done")
    return (
      <div className="space-y-4">
        <p className="rounded-md bg-success-soft px-4 py-3 text-sm font-medium text-success">Your email is confirmed.</p>
        <Button className="w-full" size="lg" onClick={() => router.push(user?.onboarding_completed ? "/app" : "/app/onboarding")}>Continue</Button>
      </div>
    );
  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3 rounded-lg bg-lavender-100 p-4">
        <MailCheck className="h-6 w-6 shrink-0 text-violet-600" />
        <p className="text-sm text-ink-muted">We sent a confirmation link to <b className="text-ink">{user?.email || "your inbox"}</b>. Open it to confirm your address.</p>
      </div>
      {state === "verifying" && <p className="text-sm text-ink-muted">Confirming…</p>}
      <InlineError error={err} />
      {demo && (
        <div className="rounded-lg border border-dashed border-violet-300 p-4 text-sm">
          <p className="font-semibold text-ink">Demo mode</p>
          <p className="mt-1 text-ink-muted">Email delivery isn't configured on this server yet, so you can confirm directly.</p>
          <Button className="mt-3" variant="soft" onClick={() => { window.location.href = demo; }}>Confirm my email</Button>
        </div>
      )}
      <Button variant="secondary" className="w-full" onClick={() => router.push("/app/onboarding")}>I'll do it later</Button>
    </div>
  );
}

export default function Page() {
  return <AuthLayout title="Check your email"><Suspense><Verify /></Suspense></AuthLayout>;
}
