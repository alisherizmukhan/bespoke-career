"use client";

import { useQuery } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ProfileSections, toPayload } from "@/components/profile-form";
import { Button, Card, InlineError, Skeleton, cx } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";

const STEPS = [
  { key: "basics", title: "About you", sub: "Tell us who you are and where you want to work." },
  { key: "work", title: "Your experience", sub: "This drives your salary estimate and resume format." },
  { key: "education", title: "Education & skills", sub: "Only add what you can back up — we never invent facts." },
  { key: "goals", title: "Goals", sub: "What you're aiming for next." },
] as const;

export default function Onboarding() {
  const router = useRouter();
  const { refresh } = useAuth();
  const q = useQuery({ queryKey: ["profile"], queryFn: () => api("/profile") });
  const [data, setData] = useState<any>(null);
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  useEffect(() => { if (q.data && !data) setData({ country: "United States", currency: "USD", ...q.data }); }, [q.data, data]);
  const set = (k: string, v: any) => setData((d: any) => ({ ...d, [k]: v }));

  const save = async (finish: boolean) => {
    setBusy(true); setErr(null);
    try {
      await api("/profile", { method: "PATCH", body: { ...toPayload(data), ...(finish ? { onboarding_completed: true } : {}) } });
      if (finish) { await refresh(); router.push("/app?welcome=1"); } else setStep((s) => s + 1);
    } catch (e) { setErr(e); } finally { setBusy(false); }
  };

  if (!data) return <Skeleton className="h-96" />;
  const s = STEPS[step];
  return (
    <div className="mx-auto max-w-3xl">
      <span className="eyebrow">Set up your profile</span>
      <h1 className="h-display mt-4 text-[32px]">{s.title}</h1>
      <p className="mt-1 text-ink-muted">{s.sub}</p>
      <ol className="mt-6 flex gap-2" aria-label="Progress">
        {STEPS.map((x, i) => (
          <li key={x.key} className="flex-1">
            <div className={cx("h-1.5 rounded-full", i <= step ? "bg-violet-600" : "bg-violet-200")} />
            <p className={cx("mt-1.5 hidden text-xs font-medium sm:block", i <= step ? "text-violet-700" : "text-ink-muted")}>{i < step && <Check className="mr-1 inline h-3 w-3" />}{x.title}</p>
          </li>
        ))}
      </ol>
      <Card className="mt-6">
        <ProfileSections data={data} set={set} sections={step === 3 ? ["goals", "links"] : [s.key]} />
        <div className="mt-8 space-y-3">
          <InlineError error={err} />
          <div className="flex items-center justify-between gap-3">
            <Button variant="ghost" onClick={() => (step ? setStep(step - 1) : router.push("/app"))} disabled={busy}>{step ? "Back" : "Skip for now"}</Button>
            {step < STEPS.length - 1 ? <Button loading={busy} onClick={() => save(false)}>Continue</Button> : <Button loading={busy} onClick={() => save(true)}>Finish setup</Button>}
          </div>
        </div>
      </Card>
    </div>
  );
}
