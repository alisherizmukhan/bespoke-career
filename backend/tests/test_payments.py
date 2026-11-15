"""Stripe flow against an in-memory fake of the Stripe REST API."""
import hashlib
import hmac
import json
import time

import pytest

from app import payments
from app.config import get_settings

from .conftest import API, make_admin, register


class FakeStripe:
    def __init__(self):
        self.products, self.sessions, self.subs, self.invoices = {}, {}, {}, {}
        self.n = 0

    def _id(self, p):
        self.n += 1
        return f"{p}_{self.n}"

    def request(self, method, path, data=None, idempotency_key=None):
        data = data or {}
        parts = path.strip("/").split("/")
        if parts[0] == "products" and method == "POST":
            if data["id"] in self.products:
                raise payments.StripeError("exists", "resource_already_exists")
            self.products[data["id"]] = data
            return data
        if parts[:2] == ["checkout", "sessions"] and method == "POST":
            sid = self._id("cs_test")
            self.sessions[sid] = {"id": sid, "url": f"https://checkout.stripe.test/{sid}", "status": "open", "mode": "subscription",
                                  "client_reference_id": data["client_reference_id"], "metadata": data["metadata"],
                                  "line": data["line_items"][0]["price_data"], "subscription": None, "invoice": None}
            return self.sessions[sid]
        if parts[:2] == ["checkout", "sessions"] and method == "GET":
            s = dict(self.sessions[parts[2]])
            if s["subscription"]:
                s["subscription"] = self.subs[s["subscription"]]
                s["invoice"] = self.invoices[s["invoice"]]
            return s
        if parts[0] == "subscriptions" and method == "GET":
            return self.subs[parts[1]]
        if parts[0] == "subscriptions" and method == "POST":
            sub = self.subs[parts[1]]
            if "cancel_at_period_end" in data:
                sub["cancel_at_period_end"] = data["cancel_at_period_end"]
            if "items" in data:
                pd = data["items"][0]["price_data"]
                sub["items"]["data"][0]["price"] = {"product": pd["product"], "recurring": pd["recurring"], "unit_amount": pd["unit_amount"]}
                inv = self._invoice(sub["id"], pd["unit_amount"], "subscription_update")
                sub = {**sub, "latest_invoice": inv}
            return sub
        if parts[0] == "billing_portal":
            return {"url": "https://billing.stripe.test/portal"}
        raise AssertionError(f"unexpected {method} {path}")

    def _invoice(self, sub_id, amount, reason):
        iid = self._id("in")
        self.invoices[iid] = {"id": iid, "status": "paid", "amount_paid": amount, "currency": "usd", "livemode": False,
                              "billing_reason": reason, "subscription": sub_id}
        return self.invoices[iid]

    def pay(self, sid):
        """What happens when the customer completes Stripe Checkout."""
        s = self.sessions[sid]
        sub_id = self._id("sub")
        now = int(time.time())
        days = 365 if s["line"]["recurring"]["interval"] == "year" else 30
        self.subs[sub_id] = {"id": sub_id, "status": "active", "customer": "cus_1", "cancel_at_period_end": False,
                             "current_period_start": now, "current_period_end": now + days * 86400, "metadata": s["metadata"],
                             "items": {"data": [{"id": "si_1", "price": {"product": s["line"]["product"], "recurring": s["line"]["recurring"],
                                                                          "unit_amount": s["line"]["unit_amount"]}}]}}
        inv = self._invoice(sub_id, s["line"]["unit_amount"], "subscription_create")
        s.update(status="complete", subscription=sub_id, invoice=inv["id"])
        return sub_id


@pytest.fixture
def stripe(monkeypatch):
    fake = FakeStripe()
    s = get_settings()
    monkeypatch.setattr(s, "stripe_secret_key", "sk_test_fake")
    monkeypatch.setattr(s, "stripe_webhook_secret", "whsec_fake")
    monkeypatch.setattr(payments, "request", fake.request)
    return fake


def signed(event):
    body = json.dumps(event).encode()
    ts = int(time.time())
    sig = hmac.new(b"whsec_fake", f"{ts}.".encode() + body, hashlib.sha256).hexdigest()
    return body, {"Stripe-Signature": f"t={ts},v1={sig}", "Content-Type": "application/json"}


def test_stripe_checkout_confirm_renew_change_cancel(client, stripe):
    h = register(client)
    plans = client.get(f"{API}/billing/plans").json()
    assert plans["provider"] == "stripe" and plans["test_mode"] is True

    r = client.post(f"{API}/billing/checkout", json={"plan": "pro", "interval": "year"}, headers=h).json()
    assert r["checkout_url"].startswith("https://checkout.stripe.test/")
    sid = r["checkout_url"].rsplit("/", 1)[1]
    sess = stripe.sessions[sid]
    assert sess["line"]["unit_amount"] == 28800 and sess["line"]["recurring"] == {"interval": "year"}
    assert "bespoke_pro" in stripe.products

    # Not paid yet: nothing is granted
    assert client.post(f"{API}/billing/checkout/confirm", json={"session_id": sid}, headers=h).json()["status"] == "pending"
    assert client.get(f"{API}/billing/subscription", headers=h).json()["plan"]["slug"] == "free"

    # Paid on Stripe -> success page confirms
    sub_id = stripe.pay(sid)
    assert client.post(f"{API}/billing/checkout/confirm", json={"session_id": sid}, headers=h).json()["plan"] == "pro"
    sub = client.get(f"{API}/billing/subscription", headers=h).json()
    assert sub["plan"]["slug"] == "pro" and sub["subscription"]["interval"] == "year" and sub["subscription"]["provider"] == "stripe"

    # The webhook for the same checkout must not double-charge
    body, hdr = signed({"type": "checkout.session.completed", "data": {"object": {"id": sid, "mode": "subscription"}}})
    assert client.post(f"{API}/billing/webhooks/stripe", content=body, headers=hdr).status_code == 200
    assert [p["amount"] for p in client.get(f"{API}/billing/history", headers=h).json()] == [288]

    # Another user can't claim this checkout
    other = register(client, "b@test.io", "Bo Kim")
    assert client.post(f"{API}/billing/checkout/confirm", json={"session_id": sid}, headers=other).status_code == 403

    # Renewal invoice via webhook
    inv = stripe._invoice(sub_id, 28800, "subscription_cycle")
    body, hdr = signed({"type": "invoice.paid", "data": {"object": inv}})
    client.post(f"{API}/billing/webhooks/stripe", content=body, headers=hdr)
    assert len(client.get(f"{API}/billing/history", headers=h).json()) == 2

    # Bad signature is rejected
    assert client.post(f"{API}/billing/webhooks/stripe", content=body, headers={**hdr, "Stripe-Signature": "t=1,v1=bad"}).status_code == 400

    # Downgrade to Plus monthly through Stripe
    assert client.post(f"{API}/billing/change-plan", json={"plan": "plus", "interval": "month"}, headers=h).status_code == 200
    sub = client.get(f"{API}/billing/subscription", headers=h).json()
    assert sub["plan"]["slug"] == "plus" and sub["subscription"]["interval"] == "month"

    # Cancel and resume go to Stripe
    client.post(f"{API}/billing/cancel", headers=h)
    assert stripe.subs[sub_id]["cancel_at_period_end"] is True
    assert client.get(f"{API}/billing/subscription", headers=h).json()["subscription"]["cancel_at_period_end"] is True
    client.post(f"{API}/billing/resume", headers=h)
    assert stripe.subs[sub_id]["cancel_at_period_end"] is False

    # Second checkout while subscribed is refused; portal works
    assert client.post(f"{API}/billing/checkout", json={"plan": "pro", "interval": "year"}, headers=h).status_code == 409
    assert client.post(f"{API}/billing/portal", headers=h).json()["url"].startswith("https://billing.stripe.test")

    # Stripe cancels at period end -> access ends
    stripe.subs[sub_id]["status"] = "canceled"
    body, hdr = signed({"type": "customer.subscription.deleted", "data": {"object": stripe.subs[sub_id]}})
    client.post(f"{API}/billing/webhooks/stripe", content=body, headers=hdr)
    assert client.get(f"{API}/billing/subscription", headers=h).json()["plan"]["slug"] == "free"

    # Revenue shows up in the CRM
    admin = make_admin(client)
    row = next(r for r in client.get(f"{API}/admin/crm/customers", headers=admin).json()["items"] if r["email"] == "a@test.io")
    assert row["lifetime_revenue"] == 288 * 2 + 19 and row["stage"] == "churned"


def test_webhook_needs_configuration(client):
    assert client.post(f"{API}/billing/webhooks/stripe", content=b"{}").status_code == 501
