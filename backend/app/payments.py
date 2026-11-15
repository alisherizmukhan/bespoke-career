"""Stripe payments over the REST API (no SDK): Checkout for new subscriptions, subscription updates for plan changes
and cancellation, and webhooks for renewals. Provisioning is idempotent, so the success-page confirmation and the
webhook can both run for the same purchase without double-counting.

The API version is pinned so the response shape (e.g. `current_period_end` on the subscription) stays stable."""
import hashlib
import hmac
import json
import time
import uuid
from datetime import datetime, timezone
from typing import Any

import httpx
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from .config import get_settings
from .models import Payment, Plan, Subscription, User, utcnow

API = "https://api.stripe.com/v1"
STRIPE_VERSION = "2024-06-20"


class StripeError(Exception):
    def __init__(self, message: str, code: str | None = None, status: int = 400):
        super().__init__(message)
        self.code, self.status = code, status


def _flatten(data: dict, prefix: str = "") -> list[tuple[str, str]]:
    """Stripe form encoding: {"a": {"b": 1}, "c": [x]} -> a[b]=1, c[0]=x."""
    out: list[tuple[str, str]] = []
    for k, v in data.items():
        key = f"{prefix}[{k}]" if prefix else str(k)
        if v is None:
            continue
        if isinstance(v, dict):
            out += _flatten(v, key)
        elif isinstance(v, (list, tuple)):
            for i, item in enumerate(v):
                if isinstance(item, dict):
                    out += _flatten(item, f"{key}[{i}]")
                else:
                    out.append((f"{key}[{i}]", str(item)))
        elif isinstance(v, bool):
            out.append((key, "true" if v else "false"))
        else:
            out.append((key, str(v)))
    return out


def request(method: str, path: str, data: dict | None = None, idempotency_key: str | None = None) -> dict:
    s = get_settings()
    headers = {"Stripe-Version": STRIPE_VERSION}
    if idempotency_key:
        headers["Idempotency-Key"] = idempotency_key
    params = _flatten(data or {})
    try:
        r = httpx.request(method, f"{API}{path}", auth=(s.stripe_secret_key, ""), headers=headers,
                          data=params if method != "GET" else None, params=params if method == "GET" else None, timeout=30)
    except httpx.HTTPError as e:
        raise StripeError(f"Couldn't reach Stripe: {e.__class__.__name__}", status=502)
    body = r.json() if r.content else {}
    if r.status_code >= 400:
        err = body.get("error", {})
        raise StripeError(err.get("message", "Stripe request failed"), err.get("code"), r.status_code)
    return body


def _ts(v: Any) -> datetime | None:
    return datetime.fromtimestamp(int(v), tz=timezone.utc) if v else None


# ------------------------------------------------------------------ products & checkout


def ensure_product(plan: Plan) -> str:
    """One Stripe product per plan, with a fixed id so it's created once and reused."""
    pid = f"bespoke_{plan.slug}"
    try:
        request("POST", "/products", {"id": pid, "name": f"Bespoke {plan.name}", "description": plan.tagline or None,
                                      "metadata": {"plan": plan.slug}})
    except StripeError as e:
        if e.code != "resource_already_exists":
            raise
    return pid


def price_data(plan: Plan, interval: str) -> dict:
    return {"currency": "usd", "product": ensure_product(plan),
            "unit_amount": plan.price_year_cents if interval == "year" else plan.price_month_cents,
            "recurring": {"interval": interval}}


def create_checkout(user: User, plan: Plan, interval: str, customer_id: str | None = None) -> dict:
    s = get_settings()
    base = s.frontend_url.rstrip("/")
    data: dict[str, Any] = {
        "mode": "subscription",
        "line_items": [{"price_data": price_data(plan, interval), "quantity": 1}],
        "client_reference_id": str(user.id),
        "metadata": {"user_id": str(user.id), "plan": plan.slug, "interval": interval},
        "subscription_data": {"metadata": {"user_id": str(user.id), "plan": plan.slug, "interval": interval}},
        "allow_promotion_codes": True,
        "billing_address_collection": "auto",
        "success_url": f"{base}/app/billing?checkout=success&session_id={{CHECKOUT_SESSION_ID}}",
        "cancel_url": f"{base}/app/billing?checkout=cancel&plan={plan.slug}&interval={interval}",
    }
    if customer_id:
        data["customer"] = customer_id
    else:
        data["customer_email"] = user.email
    return request("POST", "/checkout/sessions", data)


# ------------------------------------------------------------------ provisioning (idempotent)


def _period(sub: dict) -> tuple[datetime | None, datetime | None]:
    start, end = sub.get("current_period_start"), sub.get("current_period_end")
    if not end and sub.get("items", {}).get("data"):  # newer API versions keep periods on the item
        it = sub["items"]["data"][0]
        start, end = it.get("current_period_start"), it.get("current_period_end")
    return _ts(start), _ts(end)


def _status(stripe_status: str) -> str:
    return {"active": "active", "trialing": "active", "past_due": "past_due", "unpaid": "past_due",
            "canceled": "canceled", "incomplete_expired": "expired"}.get(stripe_status, "past_due" if stripe_status == "incomplete" else "active")


def sync_subscription(db: Session, sub: dict, user_id: uuid.UUID | None = None) -> Subscription | None:
    """Create or update the local subscription that mirrors a Stripe subscription."""
    local = db.scalar(select(Subscription).where(Subscription.provider_subscription_id == sub["id"]))
    meta = sub.get("metadata") or {}
    uid = user_id or (local.user_id if local else None) or (uuid.UUID(meta["user_id"]) if meta.get("user_id") else None)
    if not uid:
        return None
    start, end = _period(sub)
    item = (sub.get("items", {}).get("data") or [{}])[0]
    interval = ((item.get("price") or {}).get("recurring") or {}).get("interval") or meta.get("interval") or "month"
    product = (item.get("price") or {}).get("product")
    plan_slug = (product[len("bespoke_"):] if isinstance(product, str) and product.startswith("bespoke_") else None) or meta.get("plan") or "plus"
    if not local:
        # A new paid plan replaces whatever the user had (free, test or admin grant)
        for old in db.scalars(select(Subscription).where(Subscription.user_id == uid, Subscription.status.in_(["active", "past_due"]))):
            old.status = "canceled"
        local = Subscription(user_id=uid, provider="stripe", provider_subscription_id=sub["id"])
        db.add(local)
    local.provider_customer_id = sub.get("customer") if isinstance(sub.get("customer"), str) else (sub.get("customer") or {}).get("id")
    local.plan_slug, local.interval = plan_slug, interval
    local.status = _status(sub.get("status", "active"))
    local.cancel_at_period_end = bool(sub.get("cancel_at_period_end"))
    local.current_period_start = start or local.current_period_start or utcnow()
    local.current_period_end = end or local.current_period_end or utcnow()
    db.flush()
    return local


def record_invoice(db: Session, inv: dict, local: Subscription | None) -> None:
    """Store a paid invoice once."""
    if not inv or inv.get("status") != "paid" or not inv.get("id"):
        return
    if db.scalar(select(Payment.id).where(Payment.provider_ref == inv["id"])):
        return
    uid = local.user_id if local else None
    if not uid:
        return
    plan = db.scalar(select(Plan).where(Plan.slug == local.plan_slug))
    reason = {"subscription_create": "", "subscription_cycle": " renewal", "subscription_update": " plan change"}.get(inv.get("billing_reason"), "")
    db.add(Payment(user_id=uid, subscription_id=local.id if local else None, amount_cents=int(inv.get("amount_paid") or 0),
                   currency=(inv.get("currency") or "usd").upper(), status="succeeded", provider_ref=inv["id"],
                   is_test=not inv.get("livemode", False),
                   description=f"{plan.name if plan else local.plan_slug} ({local.interval}ly){reason}"))


def provision_from_session(db: Session, session_id: str, user: User | None = None) -> Subscription | None:
    """Called from the success page and from the checkout.session.completed webhook."""
    sess = request("GET", f"/checkout/sessions/{session_id}", {"expand": ["subscription", "invoice"]})
    if user and sess.get("client_reference_id") != str(user.id):
        raise HTTPException(403, "This checkout belongs to another account.")
    if sess.get("status") != "complete" or not sess.get("subscription"):
        return None
    sub = sess["subscription"] if isinstance(sess["subscription"], dict) else request("GET", f"/subscriptions/{sess['subscription']}")
    uid = uuid.UUID(sess["client_reference_id"]) if sess.get("client_reference_id") else None
    local = sync_subscription(db, sub, uid)
    inv = sess.get("invoice")
    if isinstance(inv, str):
        inv = request("GET", f"/invoices/{inv}")
    record_invoice(db, inv, local)
    db.commit()
    return local


# ------------------------------------------------------------------ changes


def change_subscription(db: Session, local: Subscription, plan: Plan, interval: str) -> Subscription:
    sub = request("GET", f"/subscriptions/{local.provider_subscription_id}")
    item_id = sub["items"]["data"][0]["id"]
    updated = request("POST", f"/subscriptions/{local.provider_subscription_id}", {
        "items": [{"id": item_id, "price_data": price_data(plan, interval)}],
        "proration_behavior": "always_invoice",
        "cancel_at_period_end": False,
        "metadata": {"plan": plan.slug, "interval": interval},
        "expand": ["latest_invoice"],
    })
    synced = sync_subscription(db, updated)
    inv = updated.get("latest_invoice")
    if isinstance(inv, dict):
        record_invoice(db, inv, synced)
    db.commit()
    return synced


def set_cancel(db: Session, local: Subscription, cancel: bool) -> Subscription:
    updated = request("POST", f"/subscriptions/{local.provider_subscription_id}", {"cancel_at_period_end": cancel})
    synced = sync_subscription(db, updated)
    db.commit()
    return synced


def portal_url(local: Subscription) -> str:
    s = get_settings()
    sess = request("POST", "/billing_portal/sessions", {"customer": local.provider_customer_id,
                                                         "return_url": f"{s.frontend_url.rstrip('/')}/app/billing"})
    return sess["url"]


# ------------------------------------------------------------------ webhooks


def verify_signature(payload: bytes, header: str, secret: str, tolerance: int = 300) -> dict:
    parts = dict(p.split("=", 1) for p in header.split(",") if "=" in p)
    sigs = [p.split("=", 1)[1] for p in header.split(",") if p.startswith("v1=")]
    ts = parts.get("t")
    if not ts or not sigs:
        raise HTTPException(400, "Missing Stripe signature.")
    expected = hmac.new(secret.encode(), f"{ts}.".encode() + payload, hashlib.sha256).hexdigest()
    if not any(hmac.compare_digest(expected, s) for s in sigs):
        raise HTTPException(400, "Invalid Stripe signature.")
    if abs(time.time() - int(ts)) > tolerance:
        raise HTTPException(400, "Stale Stripe signature.")
    return json.loads(payload)


def handle_event(db: Session, event: dict) -> str:
    kind, obj = event.get("type", ""), event.get("data", {}).get("object", {})
    if kind == "checkout.session.completed" and obj.get("mode") == "subscription":
        provision_from_session(db, obj["id"])
    elif kind in ("customer.subscription.updated", "customer.subscription.created", "customer.subscription.deleted"):
        sync_subscription(db, obj)
        db.commit()
    elif kind in ("invoice.paid", "invoice.payment_succeeded"):
        sid = obj.get("subscription")
        if sid:
            local = sync_subscription(db, request("GET", f"/subscriptions/{sid}"))
            record_invoice(db, obj, local)
            db.commit()
    elif kind == "invoice.payment_failed":
        local = db.scalar(select(Subscription).where(Subscription.provider_subscription_id == obj.get("subscription")))
        if local:
            local.status = "past_due"
            db.commit()
    else:
        return "ignored"
    return "ok"


WEBHOOK_EVENTS = ["checkout.session.completed", "customer.subscription.created", "customer.subscription.updated",
                  "customer.subscription.deleted", "invoice.paid", "invoice.payment_failed"]


def register_webhook(url: str) -> dict:
    """Create the webhook endpoint in Stripe; the response carries the signing secret (shown only once)."""
    return request("POST", "/webhook_endpoints", {"url": url, "enabled_events": WEBHOOK_EVENTS,
                                                   "description": "Bespoke subscriptions", "api_version": STRIPE_VERSION})
