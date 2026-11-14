"""Billing & subscriptions. Runs in clearly-labelled TEST MODE (no real charges) until a payment
provider is connected; the webhook endpoint is ready for Stripe-style events."""
from datetime import timedelta
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import entitlements
from ..db import get_db
from ..models import Payment, Plan, Subscription, User, utcnow
from ..security import get_current_user
from ..services import audit, notify

router = APIRouter(prefix="/billing", tags=["billing"])


def plan_out(p: Plan) -> dict:
    return {"slug": p.slug, "name": p.name, "tagline": p.tagline, "price_month": p.price_month_cents / 100,
            "price_year": p.price_year_cents / 100, "limits": p.limits, "features": p.features}


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
    return {"test_mode": True, "plans": [plan_out(p) for p in db.scalars(select(Plan).where(Plan.is_active.is_(True)).order_by(Plan.sort))]}


@router.get("/subscription")
def subscription(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    s = entitlements.active_subscription(db, user)
    plan = entitlements.current_plan(db, user)
    return {"test_mode": True, "plan": plan_out(plan) if plan.id else {"slug": "free", "name": "Free"},
            "subscription": {"status": s.status, "interval": s.interval, "current_period_end": s.current_period_end,
                             "cancel_at_period_end": s.cancel_at_period_end} if s else None,
            "usage": entitlements.snapshot(db, user)}


class CheckoutIn(BaseModel):
    plan: Literal["plus", "pro", "family"]
    interval: Literal["month", "year"] = "month"


@router.post("/checkout")
def checkout(body: CheckoutIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    plan = db.scalar(select(Plan).where(Plan.slug == body.plan, Plan.is_active.is_(True)))
    if not plan:
        raise HTTPException(404, "Plan not found.")
    if entitlements.active_subscription(db, user):
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
    return {"ok": True, "test_mode": True, "subscription_id": str(s.id)}


@router.post("/change-plan")
def change_plan(body: CheckoutIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    s = entitlements.active_subscription(db, user)
    if not s:
        return checkout(body, user, db)
    plan = db.scalar(select(Plan).where(Plan.slug == body.plan, Plan.is_active.is_(True)))
    if not plan:
        raise HTTPException(404, "Plan not found.")
    prev = s.plan_slug
    s.plan_slug, s.interval, s.cancel_at_period_end = plan.slug, body.interval, False
    audit(db, user.id, "billing.change_plan", "subscription", s.id, from_plan=prev, to_plan=plan.slug)
    notify(db, user.id, "subscription", f"Plan changed to {plan.name}", "Test mode: no real payment was taken.", "/app/billing")
    db.commit()
    return {"ok": True, "test_mode": True}


@router.post("/cancel")
def cancel(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    s = entitlements.active_subscription(db, user)
    if not s:
        raise HTTPException(409, "You don't have an active subscription.")
    s.cancel_at_period_end = True
    audit(db, user.id, "billing.cancel", "subscription", s.id)
    db.commit()
    return {"ok": True, "access_until": s.current_period_end}


@router.post("/resume")
def resume_sub(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    s = entitlements.active_subscription(db, user)
    if not s:
        raise HTTPException(409, "You don't have an active subscription.")
    s.cancel_at_period_end = False
    db.commit()
    return {"ok": True}


@router.get("/history")
def history(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    ps = db.scalars(select(Payment).where(Payment.user_id == user.id).order_by(Payment.created_at.desc())).all()
    return [{"id": str(p.id), "amount": p.amount_cents / 100, "currency": p.currency, "status": p.status,
             "description": p.description, "is_test": p.is_test, "created_at": p.created_at} for p in ps]


@router.post("/webhooks/{provider}")
async def webhook(provider: str, request: Request):
    # Placeholder for a real provider (e.g. Stripe): verify the signature header before trusting any event.
    raise HTTPException(501, f"No {provider} webhook secret configured; billing runs in test mode.")
