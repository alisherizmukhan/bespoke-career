"""Billing & subscriptions.

Two modes, chosen by configuration:
* Stripe (STRIPE_SECRET_KEY set): real Checkout, card charged by Stripe (test or live keys), renewals via webhooks.
* Built-in test mode (no key): records a subscription and a test payment without charging anything.
"""
from datetime import timedelta
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import entitlements, payments
from ..config import get_settings
from ..db import get_db
from ..models import Payment, Plan, Subscription, User, utcnow
from ..security import get_current_user
from ..services import audit, notify

router = APIRouter(prefix="/billing", tags=["billing"])


def mode() -> dict:
    s = get_settings()
    if s.stripe_enabled:
        return {"test_mode": not s.stripe_live, "provider": "stripe", "live": s.stripe_live}
    return {"test_mode": True, "provider": "test", "live": False}


def plan_out(p: Plan) -> dict:
    return {"slug": p.slug, "name": p.name, "tagline": p.tagline, "price_month": p.price_month_cents / 100,
            "price_year": p.price_year_cents / 100, "limits": p.limits, "features": p.features}


def _stripe_call(fn, *a, **kw):
    try:
        return fn(*a, **kw)
    except payments.StripeError as e:
        raise HTTPException(502 if e.status >= 500 else 400, f"Payment provider: {e}")


def renew_test_subscription(db: Session, s: Subscription) -> None:
    plan = db.scalar(select(Plan).where(Plan.slug == s.plan_slug))
    start = s.current_period_end
    s.current_period_start = start
    s.current_period_end = start + (timedelta(days=365) if s.interval == "year" else timedelta(days=30))
    if plan and plan.price_month_cents:
        amount = plan.price_year_cents if s.interval == "year" else plan.price_month_cents
        db.add(Payment(user_id=s.user_id, subscription_id=s.id, amount_cents=amount,
                       description=f"{plan.name} renewal ({s.interval}ly) — test mode", is_test=True))
    db.commit()


@router.get("/plans")
def plans(db: Session = Depends(get_db)):
    return {**mode(), "plans": [plan_out(p) for p in db.scalars(select(Plan).where(Plan.is_active.is_(True)).order_by(Plan.sort))]}


@router.get("/subscription")
def subscription(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    s = entitlements.active_subscription(db, user)
    plan = entitlements.current_plan(db, user)
    return {**mode(), "plan": plan_out(plan) if plan.id else {"slug": "free", "name": "Free"},
            "subscription": {"status": s.status, "interval": s.interval, "current_period_end": s.current_period_end,
                             "cancel_at_period_end": s.cancel_at_period_end, "provider": s.provider} if s else None,
            "usage": entitlements.snapshot(db, user)}


class CheckoutIn(BaseModel):
    plan: Literal["plus", "pro", "family"]
    interval: Literal["month", "year"] = "month"


def _plan(db: Session, slug: str) -> Plan:
    plan = db.scalar(select(Plan).where(Plan.slug == slug, Plan.is_active.is_(True)))
    if not plan:
        raise HTTPException(404, "Plan not found.")
    return plan


@router.post("/checkout")
def checkout(body: CheckoutIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    plan = _plan(db, body.plan)
    current = entitlements.active_subscription(db, user)
    if get_settings().stripe_enabled:
        if current and current.provider == "stripe":
            raise HTTPException(409, "You already have a subscription. Change your plan instead.")
        prev_customer = db.scalar(select(Subscription.provider_customer_id).where(
            Subscription.user_id == user.id, Subscription.provider_customer_id.is_not(None)).limit(1))
        sess = _stripe_call(payments.create_checkout, user, plan, body.interval, prev_customer)
        audit(db, user.id, "billing.checkout_started", "plan", plan.slug, interval=body.interval, provider="stripe")
        db.commit()
        return {"ok": True, "checkout_url": sess["url"], **mode()}

    if current:
        raise HTTPException(409, "You already have a subscription. Change your plan instead.")
    now = utcnow()
    s = Subscription(user_id=user.id, plan_slug=plan.slug, interval=body.interval, status="active",
                     current_period_start=now,
                     current_period_end=now + (timedelta(days=365) if body.interval == "year" else timedelta(days=30)))
    db.add(s)
    db.flush()
    amount = plan.price_year_cents if body.interval == "year" else plan.price_month_cents
    db.add(Payment(user_id=user.id, subscription_id=s.id, amount_cents=amount,
                   description=f"{plan.name} ({body.interval}ly) — test mode", is_test=True))
    notify(db, user.id, "subscription", f"Welcome to {plan.name}", "Test mode: no real payment was taken.", "/app/billing")
    audit(db, user.id, "billing.checkout", "subscription", s.id, plan=plan.slug, interval=body.interval, test_mode=True)
    db.commit()
    return {"ok": True, "subscription_id": str(s.id), **mode()}


class ConfirmIn(BaseModel):
    session_id: str


@router.post("/checkout/confirm")
def confirm(body: ConfirmIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """The success page calls this so the plan is active immediately, even before the webhook arrives."""
    if not get_settings().stripe_enabled:
        raise HTTPException(409, "Stripe is not configured.")
    if not body.session_id.startswith("cs_"):
        raise HTTPException(422, "Invalid checkout session.")
    already = db.scalar(select(Subscription).where(Subscription.user_id == user.id, Subscription.provider == "stripe",
                                                   Subscription.status == "active").order_by(Subscription.created_at.desc()))
    s = _stripe_call(payments.provision_from_session, db, body.session_id, user)
    if not s:
        return {"ok": False, "status": "pending"}
    plan = db.scalar(select(Plan).where(Plan.slug == s.plan_slug))
    if not already or already.id != s.id:
        notify(db, user.id, "subscription", f"Welcome to {plan.name if plan else s.plan_slug}", "Your payment went through.", "/app/billing")
        audit(db, user.id, "billing.checkout", "subscription", s.id, plan=s.plan_slug, interval=s.interval, provider="stripe")
        db.commit()
    return {"ok": True, "plan": s.plan_slug, "interval": s.interval}


@router.post("/change-plan")
def change_plan(body: CheckoutIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    s = entitlements.active_subscription(db, user)
    if not s or (get_settings().stripe_enabled and s.provider != "stripe"):
        return checkout(body, user, db)
    plan = _plan(db, body.plan)
    prev, prev_interval = s.plan_slug, s.interval
    if prev == plan.slug and prev_interval == body.interval:
        raise HTTPException(409, "You're already on this plan.")
    if s.provider == "stripe":
        _stripe_call(payments.change_subscription, db, s, plan, body.interval)
    else:
        s.plan_slug, s.interval, s.cancel_at_period_end = plan.slug, body.interval, False
        if prev_interval != body.interval:
            # A new billing interval starts a new period (test mode records the charge)
            now = utcnow()
            s.current_period_start = now
            s.current_period_end = now + (timedelta(days=365) if body.interval == "year" else timedelta(days=30))
            amount = plan.price_year_cents if body.interval == "year" else plan.price_month_cents
            db.add(Payment(user_id=user.id, subscription_id=s.id, amount_cents=amount,
                           description=f"{plan.name} ({body.interval}ly) — test mode", is_test=True))
    audit(db, user.id, "billing.change_plan", "subscription", s.id, from_plan=prev, to_plan=plan.slug,
          from_interval=prev_interval, to_interval=body.interval)
    notify(db, user.id, "subscription", f"Plan changed to {plan.name}",
           "Stripe charged the difference." if s.provider == "stripe" else "Test mode: no real payment was taken.", "/app/billing")
    db.commit()
    return {"ok": True, **mode()}


@router.post("/cancel")
def cancel(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    s = entitlements.active_subscription(db, user)
    if not s:
        raise HTTPException(409, "You don't have an active subscription.")
    if s.provider == "stripe":
        _stripe_call(payments.set_cancel, db, s, True)
    else:
        s.cancel_at_period_end = True
    audit(db, user.id, "billing.cancel", "subscription", s.id)
    db.commit()
    return {"ok": True, "access_until": s.current_period_end}


@router.post("/resume")
def resume_sub(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    s = entitlements.active_subscription(db, user)
    if not s:
        raise HTTPException(409, "You don't have an active subscription.")
    if s.provider == "stripe":
        _stripe_call(payments.set_cancel, db, s, False)
    else:
        s.cancel_at_period_end = False
    audit(db, user.id, "billing.resume", "subscription", s.id)
    db.commit()
    return {"ok": True}


@router.post("/portal")
def portal(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Stripe customer portal: update card, download invoices."""
    s = entitlements.active_subscription(db, user)
    if not s or s.provider != "stripe" or not s.provider_customer_id:
        raise HTTPException(409, "Card and invoices are managed by Stripe once you have a paid subscription.")
    return {"url": _stripe_call(payments.portal_url, s)}


@router.get("/history")
def history(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    ps = db.scalars(select(Payment).where(Payment.user_id == user.id).order_by(Payment.created_at.desc())).all()
    return [{"id": str(p.id), "amount": p.amount_cents / 100, "currency": p.currency, "status": p.status,
             "description": p.description, "is_test": p.is_test, "created_at": p.created_at} for p in ps]


@router.post("/webhooks/{provider}")
async def webhook(provider: str, request: Request, db: Session = Depends(get_db)):
    s = get_settings()
    if provider != "stripe" or not s.stripe_enabled or not s.stripe_webhook_secret:
        raise HTTPException(501, f"No {provider} webhook secret configured.")
    payload = await request.body()
    event = payments.verify_signature(payload, request.headers.get("Stripe-Signature", ""), s.stripe_webhook_secret)
    try:
        result = payments.handle_event(db, event)
    except payments.StripeError as e:
        raise HTTPException(502, f"Stripe: {e}")
    return {"received": True, "result": result}
