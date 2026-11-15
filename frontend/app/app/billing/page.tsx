"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, Check } from "@/components/icons";
import { IntervalToggle, LIMIT_ROWS, PlanPrice, annualMath, limitText, maxSavingPct, usd, type Interval, type PlanData } from "@/components/pricing";
import { Badge, Button, Card, ErrorState, InlineError, PageHeader, Skeleton, cx } from "@/components/ui";
import { api } from "@/lib/api";
import { date, money } from "@/lib/format";

type Pick = { plan: string; interval: Interval };

const addDays = (d: number) => new Date(Date.now() + d * 86400000).toISOString();

const REASONS = ["It costs too much", "I found a job", "I'm not using it enough", "It's missing something I need", "Something else"];

export default function Billing() {
  const qc = useQueryClient();
  const [interval, setInterval] = useState<Interval>("year");
  const [pending, setPending] = useState<Pick | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [reason, setReason] = useState<string | null>(null);
  const confirmRef = useRef<HTMLDivElement>(null);
  const sub = useQuery({ queryKey: ["subscription"], queryFn: () => api("/billing/subscription") });
  const plans = useQuery({ queryKey: ["plans"], queryFn: () => api("/billing/plans") });
  const history = useQuery({ queryKey: ["billing-history"], queryFn: () => api("/billing/history") });
  const refresh = () => ["subscription", "billing-history", "dashboard"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
  const change = useMutation({
    mutationFn: (v: Pick) => api(sub.data?.subscription ? "/billing/change-plan" : "/billing/checkout", { body: v }),
    onSuccess: (r: any, v: Pick) => {
      if (r?.checkout_url) { window.location.href = r.checkout_url; return; }
      setInterval(v.interval); setPending(null); setLeaving(false); refresh();
      if (window.location.search) window.history.replaceState(null, "", "/app/billing");
    },
  });
  const cancel = useMutation({ mutationFn: () => api("/billing/cancel", { method: "POST" }), onSuccess: () => { setLeaving(false); refresh(); } });
  const resume = useMutation({ mutationFn: () => api("/billing/resume", { method: "POST" }), onSuccess: refresh });
  const portal = useMutation({ mutationFn: () => api("/billing/portal", { method: "POST" }), onSuccess: (r: any) => { window.location.href = r.url; } });
  const [notice, setNotice] = useState<{ tone: "success" | "info" | "warning"; text: string } | null>(null);
  const confirmPay = useMutation({
    mutationFn: (session_id: string) => api("/billing/checkout/confirm", { body: { session_id } }),
    onSuccess: (r: any) => {
      setNotice(r.ok ? { tone: "success", text: `Payment received. Your plan is active.` } : { tone: "info", text: "Stripe is still processing the payment. This page will update in a moment." });
      refresh();
      window.history.replaceState(null, "", "/app/billing");
    },
  });

  // Arriving from the pricing page with a plan already chosen: open its summary.
  useEffect(() => {
    const qs = new URLSearchParams(window.location.search);
    if (qs.get("checkout") === "success" && qs.get("session_id")) { confirmPay.mutate(qs.get("session_id")!); return; }
    if (qs.get("checkout") === "cancel") setNotice({ tone: "info", text: "Checkout was cancelled. You weren't charged." });
    const plan = qs.get("plan");
    if (plan && ["plus", "pro", "family"].includes(plan)) {
      const iv: Interval = qs.get("interval") === "month" ? "month" : "year";
      setInterval(iv);
      setPending({ plan, interval: iv });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { if (pending) confirmRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }); }, [pending]);

  if (sub.isLoading) return <Skeleton className="h-96" />;
  if (sub.isError) return <ErrorState error={sub.error} retry={() => sub.refetch()} />;
  const cur = sub.data.plan.slug;
  const s = sub.data.subscription;
  const planList: PlanData[] = plans.data?.plans || [];
  const curPlan = planList.find((p) => p.slug === cur);
  const free = planList.find((p) => p.slug === "free");
  const upsell = s && s.interval === "month" && !s.cancel_at_period_end ? curPlan : undefined;
  const alreadyOn = pending && pending.plan === cur && s?.interval === pending.interval;
  const target = pending && !alreadyOn ? planList.find((p) => p.slug === pending.plan) : undefined;
  const cheaper = planList.find((p) => p.slug === "plus");
  const stripe = sub.data.provider === "stripe";

  return (
    <div>
      <PageHeader title="Plan & billing" subtitle="Change plans anytime. Limits reset at the start of each month." />
      {notice && (
        <div className={cx("mb-5 rounded-lg px-4 py-3 text-sm", notice.tone === "success" ? "bg-success-soft text-success" : notice.tone === "warning" ? "bg-warning-soft text-warning" : "bg-accent-soft text-accent-ink")}>{notice.text}</div>
      )}
      {confirmPay.isPending && <div className="mb-5 rounded-lg bg-accent-soft px-4 py-3 text-sm text-accent-ink">Confirming your payment with Stripe…</div>}
      {stripe ? (
        !sub.data.live && (
          <div className="mb-5 rounded-lg border border-dashed border-warning bg-warning-soft px-4 py-3 text-sm text-warning">
            <b>Stripe test mode.</b> Checkout is the real Stripe flow, but no real money moves. Pay with the test card 4242 4242 4242 4242, any future date and any CVC.
          </div>
        )
      ) : (
        <div className="mb-5 rounded-lg border border-dashed border-warning bg-warning-soft px-4 py-3 text-sm text-warning">
          <b>Test mode.</b> Checkout records a test subscription and a test payment. No card is charged and no money moves.
        </div>
      )}

      <Card className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="flex-1">
          <p className="text-sm text-ink-muted">Current plan</p>
          <p className="text-2xl font-semibold">{sub.data.plan.name}</p>
          {s && curPlan && (
            <p className="text-sm text-ink-muted">
              {s.cancel_at_period_end
                ? `Ends on ${date(s.current_period_end)}, then moves to Free`
                : `Renews ${date(s.current_period_end)} at ${usd(s.interval === "year" ? curPlan.price_year : curPlan.price_month)} · billed ${s.interval}ly`}
            </p>
          )}
        </div>
        {s?.provider === "stripe" && <Button variant="ghost" loading={portal.isPending} onClick={() => portal.mutate()}>Card and invoices</Button>}
        {s && (s.cancel_at_period_end
          ? <Button variant="secondary" loading={resume.isPending} onClick={() => resume.mutate()}>Keep my plan</Button>
          : !leaving && <Button variant="secondary" onClick={() => { setLeaving(true); setReason(null); }}>Cancel plan</Button>)}
      </Card>

      {/* Cancel: say plainly what changes, offer at most one cheaper option that fits the reason, never hide the cancel button */}
      {leaving && s && curPlan && (
        <Card className="mb-6 border-ink">
          <p className="text-lg font-semibold">Before you cancel</p>
          <p className="mt-1 text-sm text-ink-muted">
            You keep {curPlan.name} until <b className="font-medium text-ink">{date(s.current_period_end)}</b>. After that your account moves to Free. Your resumes, applications and notes stay.
          </p>
          {free && (
            <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {LIMIT_ROWS.filter((r) => (curPlan.limits?.[r.key] ?? 0) !== (free.limits?.[r.key] ?? 0)).slice(0, 4).map((r) => (
                <div key={r.key} className="rounded-md bg-lavender-50 px-3 py-2 text-small">
                  <p className="text-ink-muted">{r.label}</p>
                  <p className="tabular mt-0.5 font-medium">{limitText(curPlan.limits?.[r.key], r.flag)} <ArrowRight className="inline h-3.5 w-3.5 text-ink-faint" /> {limitText(free.limits?.[r.key], r.flag)}</p>
                </div>
              ))}
            </div>
          )}
          <p className="mt-5 text-small font-medium">What's the main reason? <span className="font-normal text-ink-faint">Optional</span></p>
          <div className="mt-2 flex flex-wrap gap-2">
            {REASONS.map((r) => (
              <button key={r} type="button" onClick={() => setReason(r === reason ? null : r)}
                className={cx("rounded-md border px-3 py-1.5 text-small font-medium", r === reason ? "border-ink bg-ink text-white" : "border-line bg-white text-ink-muted hover:text-ink")}>{r}</button>
            ))}
          </div>
          {reason === "I found a job" && <p className="mt-4 rounded-md bg-success-soft px-3 py-2 text-sm text-success">Congratulations. Everything you built stays on Free for your next move.</p>}
          {(reason === "It costs too much" || reason === "I'm not using it enough") && (
            s.interval === "month" ? (
              <div className="mt-4 flex flex-col gap-3 rounded-md bg-accent-soft p-4 sm:flex-row sm:items-center">
                <p className="flex-1 text-sm">Stay on {curPlan.name} for <b>{usd(annualMath(curPlan).perMonth)}/mo</b> by paying yearly, {usd(annualMath(curPlan).saved)} less over a year.</p>
                <Button size="sm" loading={change.isPending} onClick={() => change.mutate({ plan: curPlan.slug, interval: "year" })}>Switch to yearly</Button>
              </div>
            ) : cheaper && cur !== "plus" ? (
              <div className="mt-4 flex flex-col gap-3 rounded-md bg-accent-soft p-4 sm:flex-row sm:items-center">
                <p className="flex-1 text-sm">Move to {cheaper.name} for <b>{usd(annualMath(cheaper).perMonth)}/mo</b> and keep 20 tailored resumes a month.</p>
                <Button size="sm" loading={change.isPending} onClick={() => change.mutate({ plan: cheaper.slug, interval: "year" })}>Switch to {cheaper.name}</Button>
              </div>
            ) : null
          )}
          <InlineError error={cancel.error || change.error || portal.error} />
          <div className="mt-5 flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setLeaving(false)}>Keep {curPlan.name}</Button>
            <Button variant="danger" loading={cancel.isPending} onClick={() => cancel.mutate()}>Cancel plan</Button>
          </div>
        </Card>
      )}

      {upsell && !leaving && (
        <Card className="mb-6 flex flex-col gap-4 border-accent/40 bg-accent-soft sm:flex-row sm:items-center">
          <div className="flex-1">
            <p className="text-body font-semibold">Pay yearly and save {money(annualMath(upsell).saved)}</p>
            <p className="mt-1 text-sm text-ink-muted">{upsell.name} for {usd(annualMath(upsell).perMonth)}/mo instead of {usd(upsell.price_month)}/mo, billed {usd(upsell.price_year)} once a year.</p>
          </div>
          <Button onClick={() => setPending({ plan: upsell.slug, interval: "year" })}>Review yearly</Button>
        </Card>
      )}

      {/* Order summary: what is charged, when it renews, what changes */}
      {pending && target && (
        <div ref={confirmRef}>
          <Card className="mb-6 border-ink">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-small text-ink-muted">Order summary</p>
                <p className="text-xl font-semibold">{target.name}, billed {pending.interval}ly</p>
              </div>
              {pending.interval === "year" && <Badge tone="success">Save {usd(annualMath(target).saved)} vs monthly</Badge>}
            </div>
            <div className="mt-5 grid gap-6 lg:grid-cols-2">
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between gap-4"><dt className="text-ink-muted">You pay today</dt><dd className="tabular text-lg font-semibold">{usd(pending.interval === "year" ? target.price_year : target.price_month)}</dd></div>
                {pending.interval === "year" && <div className="flex justify-between gap-4"><dt className="text-ink-muted">Works out to</dt><dd className="tabular">{usd(annualMath(target).perMonth)} a month</dd></div>}
                <div className="flex justify-between gap-4"><dt className="text-ink-muted">Next charge</dt><dd className="tabular">{date(addDays(pending.interval === "year" ? 365 : 30))}, same amount</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-ink-muted">Cancel</dt><dd>Anytime, access to the end of the period</dd></div>
                {stripe
                  ? <div className="flex justify-between gap-4 border-t border-line pt-2"><dt className="text-ink-muted">Payment</dt><dd>{sub.data.live ? "Card, processed securely by Stripe" : "Stripe test mode, no real charge"}</dd></div>
                  : <div className="flex justify-between gap-4 border-t border-line pt-2"><dt className="text-ink-muted">Charged in beta</dt><dd className="font-medium text-warning">$0, test mode</dd></div>}
              </dl>
              <div>
                <p className="text-small font-medium">You get{curPlan && cur !== target.slug ? ` compared with ${curPlan.name}` : ""}</p>
                <ul className="mt-2 space-y-1.5 text-small">
                  {LIMIT_ROWS.map((r) => {
                    const now = curPlan?.limits?.[r.key] ?? 0, next = target.limits?.[r.key] ?? 0;
                    if (!next) return null;
                    const up = curPlan && cur !== target.slug && now !== next;
                    return (
                      <li key={r.key} className="flex justify-between gap-3">
                        <span className="text-ink-muted">{r.label}</span>
                        <span className="tabular font-medium">{up && <span className="mr-1 text-ink-faint line-through">{limitText(now, r.flag)}</span>}{limitText(next, r.flag)}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>
            <InlineError error={change.error} />
            <div className="mt-6 flex flex-wrap gap-2">
              <Button loading={change.isPending} onClick={() => change.mutate(pending)}>
                {stripe && !s ? "Continue to secure checkout" : "Confirm and pay"} {usd(pending.interval === "year" ? target.price_year : target.price_month)}
              </Button>
              {pending.interval === "month" && target.price_month > 0 && (
                <Button variant="secondary" onClick={() => { setPending({ ...pending, interval: "year" }); setInterval("year"); }}>
                  Pay yearly instead, save {usd(annualMath(target).saved)}
                </Button>
              )}
              <Button variant="ghost" onClick={() => setPending(null)}>Back</Button>
            </div>
          </Card>
        </div>
      )}

      <div className="mb-5 flex justify-center"><IntervalToggle value={interval} onChange={setInterval} savePct={maxSavingPct(planList)} /></div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {planList.map((p) => {
          const isCur = p.slug === cur && (!s || s.interval === interval);
          return (
            <Card key={p.slug} className={cx("flex flex-col", p.slug === cur && "border-ink")}>
              <div className="flex items-center justify-between"><p className="text-base font-semibold">{p.name}</p>{p.slug === cur && <Badge tone="info">Current{s ? ` · ${s.interval}ly` : ""}</Badge>}</div>
              <PlanPrice plan={p} interval={interval} onPickYearly={() => setInterval("year")} />
              <ul className="mt-5 flex-1 space-y-2 text-small text-ink-muted">{p.features.map((f) => <li key={f} className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-ink" />{f}</li>)}</ul>
              {!isCur && p.slug !== "free" && (
                <Button className="mt-5" variant={p.slug === "pro" ? "primary" : "secondary"} onClick={() => setPending({ plan: p.slug, interval })}>
                  {p.slug === cur ? `Switch to ${interval}ly billing` : `${planList.findIndex((x) => x.slug === p.slug) > planList.findIndex((x) => x.slug === cur) ? "Upgrade" : "Switch"} to ${p.name}`}
                </Button>
              )}
            </Card>
          );
        })}
      </div>

      <h2 className="mb-3 mt-8 text-lg font-medium">Billing history</h2>
      <Card className="!p-0">
        {history.data?.length ? (
          <table className="w-full text-sm"><tbody>{history.data.map((h: any) => (
            <tr key={h.id} className="border-b border-line last:border-0">
              <td className="px-5 py-3">{date(h.created_at)}</td><td className="px-5 py-3">{h.description}</td>
              <td className="tabular px-5 py-3 text-right">{money(h.amount)}</td><td className="px-5 py-3 text-right">{h.is_test && <Badge tone="warning">Test</Badge>}</td>
            </tr>
          ))}</tbody></table>
        ) : <p className="p-6 text-sm text-ink-muted">No payments yet.</p>}
      </Card>
    </div>
  );
}
