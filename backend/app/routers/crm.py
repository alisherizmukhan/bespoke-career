"""Admin CRM (customers, lifecycle, notes, tasks), content management (site copy, job moderation) and CSV/Excel export."""
import csv
import io
import uuid
from collections import Counter
from datetime import datetime, timedelta
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import (AICall, AuditLog, CrmNote, CrmRecord, Job, JobApplication, Payment, Plan, Resume, SiteContent,
                      Subscription, UsageRecord, User, UserProfile, utcnow)
from ..security import client_ip, require_admin
from ..services import audit

router = APIRouter(tags=["admin-crm"])

STAGES = ["new", "activated", "paying", "churning", "churned", "inactive", "vip", "blocked"]
STAGE_LABEL = {"new": "New signup", "activated": "Activated", "paying": "Paying", "churning": "Cancelling",
               "churned": "Churned", "inactive": "Inactive", "vip": "VIP", "blocked": "Blocked"}


def _aware(d: datetime | None) -> datetime | None:
    if d is None:
        return None
    return d if d.tzinfo else d.replace(tzinfo=utcnow().tzinfo)


# ------------------------------------------------------------------ customer rows


def _customer_rows(db: Session, user_ids: list[uuid.UUID] | None = None) -> list[dict]:
    """One flat row per user with plan, revenue, activity and CRM fields. Used by the list, detail and export."""
    uq = select(User, UserProfile).outerjoin(UserProfile, UserProfile.user_id == User.id).order_by(User.created_at.desc())
    if user_ids is not None:
        uq = uq.where(User.id.in_(user_ids))
    pairs = db.execute(uq).all()
    plans = {p.slug: p for p in db.scalars(select(Plan))}
    active = {s.user_id: s for s in db.scalars(select(Subscription).where(Subscription.status.in_(["active", "past_due"]))
                                                .order_by(Subscription.created_at))}
    ever_paid = set(db.scalars(select(Subscription.user_id).where(Subscription.plan_slug != "free")).all())

    def counts(model, col=None) -> dict:
        c = col if col is not None else model.user_id
        return dict(db.execute(select(c, func.count()).group_by(c)).all())

    revenue = dict(db.execute(select(Payment.user_id, func.sum(Payment.amount_cents)).where(Payment.status == "succeeded")
                              .group_by(Payment.user_id)).all())
    apps, resumes, ai = counts(JobApplication), counts(Resume), counts(AICall)
    notes = counts(CrmNote)
    open_tasks = dict(db.execute(select(CrmNote.user_id, func.count()).where(CrmNote.kind == "task", CrmNote.done.is_(False))
                                 .group_by(CrmNote.user_id)).all())
    last_ai = dict(db.execute(select(AICall.user_id, func.max(AICall.created_at)).group_by(AICall.user_id)).all())
    crm = {r.user_id: r for r in db.scalars(select(CrmRecord))}
    now = utcnow()
    rows = []
    for u, p in pairs:
        s = active.get(u.id)
        plan = plans.get(s.plan_slug) if s else None
        mrr = 0.0
        if s and plan:
            mrr = (plan.price_year_cents / 12 if s.interval == "year" else plan.price_month_cents) / 100
        last_seen = max([d for d in (_aware(u.last_login_at), _aware(last_ai.get(u.id))) if d], default=None)
        created = _aware(u.created_at)
        n_apps, n_res = apps.get(u.id, 0), resumes.get(u.id, 0)
        if u.account_status != "active":
            auto = "blocked"
        elif s and s.plan_slug != "free":
            auto = "churning" if s.cancel_at_period_end else "paying"
        elif u.id in ever_paid:
            auto = "churned"
        elif last_seen and (now - last_seen).days > 30:
            auto = "inactive"
        elif (p and p.onboarding_completed) or n_apps or n_res:
            auto = "activated"
        else:
            auto = "new"
        rec = crm.get(u.id)
        stage = (rec.stage if rec and rec.stage else auto)
        # Engagement 0-100: recent activity plus depth of use
        recency = 0 if not last_seen else max(0, 40 - (now - last_seen).days * 2)
        depth = min(60, n_apps * 4 + n_res * 8 + min(ai.get(u.id, 0), 40) // 2)
        rows.append({
            "id": str(u.id), "email": u.email, "full_name": (p.full_name if p else "") or "", "role": u.role,
            "account_status": u.account_status, "profile_type": p.profile_type if p else None,
            "city": p.city if p else None, "current_title": p.current_title if p else None,
            "target_title": p.target_title if p else None,
            "plan": s.plan_slug if s else "free", "interval": s.interval if s else None,
            "subscription_status": s.status if s else None, "cancel_at_period_end": bool(s and s.cancel_at_period_end),
            "renews_at": s.current_period_end if s else None, "mrr": round(mrr, 2),
            "lifetime_revenue": round((revenue.get(u.id) or 0) / 100, 2),
            "applications": n_apps, "resumes": n_res, "ai_calls": ai.get(u.id, 0), "engagement": recency + depth,
            "stage": stage, "stage_auto": auto, "stage_manual": bool(rec and rec.stage),
            "tags": (rec.tags if rec else []) or [], "follow_up_at": rec.follow_up_at if rec else None,
            "notes": notes.get(u.id, 0), "open_tasks": open_tasks.get(u.id, 0),
            "email_verified": u.email_verified_at is not None, "onboarded": bool(p and p.onboarding_completed),
            "created_at": created, "last_login_at": u.last_login_at, "last_seen_at": last_seen,
        })
    return rows


@router.get("/admin/crm/overview")
def overview(admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    rows = [r for r in _customer_rows(db) if r["role"] != "admin"]
    stages = Counter(r["stage"] for r in rows)
    paying = [r for r in rows if r["mrr"] > 0]
    mrr = sum(r["mrr"] for r in paying)
    now = utcnow()
    since = now - timedelta(days=30)
    signups = Counter(r["created_at"].date().isoformat() for r in rows if r["created_at"] and r["created_at"] >= since)
    days = [(since + timedelta(days=i + 1)).date().isoformat() for i in range(30)]
    tasks_open = db.scalar(select(func.count()).select_from(CrmNote).where(CrmNote.kind == "task", CrmNote.done.is_(False))) or 0
    overdue = db.scalar(select(func.count()).select_from(CrmNote).where(CrmNote.kind == "task", CrmNote.done.is_(False),
                                                                        CrmNote.due_at < now)) or 0
    return {
        "customers": len(rows), "paying": len(paying), "mrr": round(mrr, 2), "arr": round(mrr * 12, 2),
        "arpu": round(mrr / len(paying), 2) if paying else 0,
        "yearly_share": round(sum(1 for r in paying if r["interval"] == "year") / len(paying) * 100) if paying else 0,
        "conversion": round(len(paying) / len(rows) * 100, 1) if rows else 0,
        "lifetime_revenue": round(sum(r["lifetime_revenue"] for r in rows), 2),
        "stages": [{"stage": s, "label": STAGE_LABEL[s], "count": stages.get(s, 0)} for s in STAGES],
        "plans": dict(Counter(r["plan"] for r in rows)),
        "signups": [{"day": d, "count": signups.get(d, 0)} for d in days],
        "tasks_open": tasks_open, "tasks_overdue": overdue,
        "follow_ups_due": sum(1 for r in rows if r["follow_up_at"] and _aware(r["follow_up_at"]) <= now),
    }


@router.get("/admin/crm/customers")
def customers(q: str | None = None, stage: str | None = None, plan: str | None = None, tag: str | None = None,
              sort: Literal["newest", "revenue", "mrr", "engagement", "last_seen", "follow_up"] = "newest",
              admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    rows = [r for r in _customer_rows(db) if r["role"] != "admin"]
    if q:
        ql = q.lower()
        rows = [r for r in rows if ql in r["email"].lower() or ql in r["full_name"].lower() or any(ql in t.lower() for t in r["tags"])]
    if stage:
        rows = [r for r in rows if r["stage"] == stage]
    if plan:
        rows = [r for r in rows if r["plan"] == plan]
    if tag:
        rows = [r for r in rows if tag in r["tags"]]
    far = datetime.max.replace(tzinfo=utcnow().tzinfo)
    old = datetime.min.replace(tzinfo=utcnow().tzinfo)
    key = {"newest": lambda r: r["created_at"] or old, "revenue": lambda r: r["lifetime_revenue"], "mrr": lambda r: r["mrr"],
           "engagement": lambda r: r["engagement"], "last_seen": lambda r: r["last_seen_at"] or old,
           "follow_up": lambda r: _aware(r["follow_up_at"]) or far}[sort]
    rows.sort(key=key, reverse=sort != "follow_up")
    tags = sorted({t for r in _customer_rows(db) for t in r["tags"]}) if not (q or stage or plan or tag) else sorted({t for r in rows for t in r["tags"]})
    return {"total": len(rows), "items": rows[:1000], "tags": tags, "stages": [{"value": s, "label": STAGE_LABEL[s]} for s in STAGES]}


def _note_out(n: CrmNote, authors: dict) -> dict:
    return {"id": str(n.id), "kind": n.kind, "body": n.body, "due_at": n.due_at, "done": n.done, "created_at": n.created_at,
            "author": authors.get(n.author_id, "System"), "user_id": str(n.user_id)}


@router.get("/admin/crm/customers/{uid}")
def customer(uid: uuid.UUID, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    rows = _customer_rows(db, [uid])
    if not rows:
        raise HTTPException(404, "Customer not found.")
    notes = db.scalars(select(CrmNote).where(CrmNote.user_id == uid).order_by(CrmNote.created_at.desc())).all()
    authors = {u.id: u.email for u in db.scalars(select(User).where(User.id.in_({n.author_id for n in notes if n.author_id})))}
    subs = db.scalars(select(Subscription).where(Subscription.user_id == uid).order_by(Subscription.created_at.desc())).all()
    pays = db.scalars(select(Payment).where(Payment.user_id == uid).order_by(Payment.created_at.desc())).all()
    apps = db.scalars(select(JobApplication).where(JobApplication.user_id == uid).order_by(JobApplication.updated_at.desc()).limit(25)).all()
    usage = db.scalars(select(UsageRecord).where(UsageRecord.user_id == uid).order_by(UsageRecord.period.desc()).limit(24)).all()
    events = db.scalars(select(AuditLog).where(or_(AuditLog.actor_id == uid, AuditLog.entity_id == str(uid)))
                        .order_by(AuditLog.created_at.desc()).limit(40)).all()
    return {
        **rows[0],
        "notes": [_note_out(n, authors) for n in notes],
        "subscriptions": [{"id": str(s.id), "plan": s.plan_slug, "interval": s.interval, "status": s.status, "provider": s.provider,
                           "start": s.current_period_start, "end": s.current_period_end, "cancel_at_period_end": s.cancel_at_period_end,
                           "created_at": s.created_at} for s in subs],
        "payments": [{"id": str(p.id), "amount": p.amount_cents / 100, "status": p.status, "description": p.description,
                      "is_test": p.is_test, "created_at": p.created_at} for p in pays],
        "recent_applications": [{"id": str(a.id), "title": a.job_title, "company": a.company_name, "status": a.status, "updated_at": a.updated_at}
                         for a in apps],
        "usage": [{"feature": r.feature, "period": r.period, "count": r.count} for r in usage],
        "events": [{"action": e.action, "created_at": e.created_at, "details": e.details} for e in events],
    }


class CustomerPatch(BaseModel):
    stage: str | None = None
    tags: list[str] | None = None
    follow_up_at: datetime | None = None


def _record(db: Session, uid: uuid.UUID) -> CrmRecord:
    rec = db.get(CrmRecord, uid)
    if not rec:
        rec = CrmRecord(user_id=uid, tags=[])
        db.add(rec)
    return rec


@router.patch("/admin/crm/customers/{uid}")
def patch_customer(uid: uuid.UUID, body: CustomerPatch, request: Request, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    if not db.get(User, uid):
        raise HTTPException(404, "Customer not found.")
    d = body.model_dump(exclude_unset=True)
    rec = _record(db, uid)
    if "stage" in d:
        if d["stage"] and d["stage"] not in STAGES:
            raise HTTPException(422, "Unknown stage.")
        rec.stage = d["stage"] or None
    if "tags" in d:
        rec.tags = sorted({t.strip()[:30] for t in (d["tags"] or []) if t.strip()})[:20]
    if "follow_up_at" in d:
        rec.follow_up_at = d["follow_up_at"]
    audit(db, admin.id, "crm.customer_updated", "user", uid, ip=client_ip(request), **{k: str(v) for k, v in d.items()})
    db.commit()
    return {"ok": True}


class NoteIn(BaseModel):
    kind: Literal["note", "call", "email", "task"] = "note"
    body: str = Field(min_length=1, max_length=5000)
    due_at: datetime | None = None


@router.post("/admin/crm/customers/{uid}/notes", status_code=201)
def add_note(uid: uuid.UUID, body: NoteIn, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    if not db.get(User, uid):
        raise HTTPException(404, "Customer not found.")
    n = CrmNote(user_id=uid, author_id=admin.id, kind=body.kind, body=body.body.strip(), due_at=body.due_at)
    db.add(n)
    audit(db, admin.id, f"crm.{body.kind}_added", "user", uid)
    db.commit()
    return {"id": str(n.id)}


class NotePatch(BaseModel):
    body: str | None = Field(None, min_length=1, max_length=5000)
    done: bool | None = None
    due_at: datetime | None = None


@router.patch("/admin/crm/notes/{nid}")
def patch_note(nid: uuid.UUID, body: NotePatch, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    n = db.get(CrmNote, nid)
    if not n:
        raise HTTPException(404, "Note not found.")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(n, k, v)
    db.commit()
    return {"ok": True}


@router.delete("/admin/crm/notes/{nid}")
def delete_note(nid: uuid.UUID, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    n = db.get(CrmNote, nid)
    if not n:
        raise HTTPException(404, "Note not found.")
    audit(db, admin.id, "crm.note_deleted", "user", n.user_id, kind=n.kind)
    db.delete(n)
    db.commit()
    return {"ok": True}


@router.get("/admin/crm/tasks")
def tasks(status: Literal["open", "done", "all"] = "open", admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    stmt = select(CrmNote, User).join(User, User.id == CrmNote.user_id).where(CrmNote.kind == "task")
    if status != "all":
        stmt = stmt.where(CrmNote.done.is_(status == "done"))
    items = db.execute(stmt.order_by(CrmNote.due_at.is_(None), CrmNote.due_at, CrmNote.created_at.desc()).limit(500)).all()
    authors = {u.id: u.email for u in db.scalars(select(User).where(User.role == "admin"))}
    return [{**_note_out(n, authors), "customer_email": u.email} for n, u in items]


# ------------------------------------------------------------------ jobs moderation


@router.get("/admin/jobs")
def admin_jobs(q: str | None = None, source: str | None = None, active: Literal["all", "active", "hidden"] = "all",
               limit: int = Query(50, le=200), offset: int = 0, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    stmt = select(Job)
    if q:
        stmt = stmt.where(or_(Job.title.ilike(f"%{q}%"), Job.company.ilike(f"%{q}%"), Job.location.ilike(f"%{q}%")))
    if source:
        stmt = stmt.where(Job.source_kind == source)
    if active != "all":
        stmt = stmt.where(Job.is_active.is_(active == "active"))
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    jobs = db.scalars(stmt.order_by(Job.fetched_at.desc()).offset(offset).limit(limit)).all()
    sources = [s for s, in db.execute(select(Job.source_kind).distinct()).all()]
    return {"total": total, "sources": sorted(sources), "items": [{
        "id": str(j.id), "title": j.title, "company": j.company, "location": j.location, "source": j.source_kind,
        "source_name": j.source_name, "url": j.url, "salary_min": j.salary_min, "salary_max": j.salary_max,
        "salary_period": j.salary_period, "category": j.category, "is_active": j.is_active, "is_duplicate": j.is_duplicate,
        "published_at": j.published_at, "fetched_at": j.fetched_at} for j in jobs]}


class JobPatch(BaseModel):
    is_active: bool | None = None
    title: str | None = Field(None, min_length=2, max_length=300)
    company: str | None = Field(None, max_length=200)
    location: str | None = Field(None, max_length=160)
    category: str | None = Field(None, max_length=60)
    salary_min: float | None = Field(None, ge=0)
    salary_max: float | None = Field(None, ge=0)


@router.patch("/admin/jobs/{jid}")
def patch_job(jid: uuid.UUID, body: JobPatch, request: Request, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    j = db.get(Job, jid)
    if not j:
        raise HTTPException(404, "Job not found.")
    d = body.model_dump(exclude_unset=True)
    for k, v in d.items():
        setattr(j, k, v)
    audit(db, admin.id, "admin.job_updated", "job", j.id, ip=client_ip(request), **{k: str(v) for k, v in d.items()})
    db.commit()
    return {"ok": True}


# ------------------------------------------------------------------ site content


CONTENT_DEFAULTS: dict[str, dict] = {
    "announcement": {"active": False, "text": "", "link": "", "link_label": ""},
    "landing_hero": {"headline": "Know what your role pays before you apply",
                     "subhead": "Bespoke reads live US job postings so you can see your market pay, tailor your resume to the posting and keep every application moving.",
                     "cta": "Create a free account"},
    "pricing": {"headline": "Plans for every stage of your search",
                "subhead": "Start free. When you're applying every week, Career Pro on the yearly plan costs less than a dollar a day, and you can cancel the moment you sign an offer."},
    "pricing_faq": {"items": [
        {"q": "What do I pay today?", "a": "Yearly plans are charged once for 12 months; monthly plans are charged every month. The amount on the button is the full amount, with no setup fees. During the beta, billing runs in test mode and no card is charged."},
        {"q": "Can I cancel?", "a": "Yes, from Plan & billing in two clicks. You keep everything you paid for until the end of the current period, then move to Free."},
        {"q": "What happens to my resumes and applications if I downgrade?", "a": "They stay in your account. Free keeps every resume and application you created; only new generations and analyses are limited."},
        {"q": "Can I switch between monthly and yearly?", "a": "Yes, at any time. Moving to yearly starts a new 12-month period at the yearly price."},
        {"q": "Does Bespoke make things up on my resume?", "a": "No. Resumes are built only from facts in your profile and the posting. Anything missing is flagged for you to add, never invented."},
        {"q": "Where does the salary data come from?", "a": "From live US job postings that disclose pay, refreshed every hour. Each estimate shows how many postings it is based on."},
    ]},
}


def _content(db: Session) -> dict:
    saved = {c.key: c.value for c in db.scalars(select(SiteContent))}
    return {k: {**v, **(saved.get(k) or {})} for k, v in CONTENT_DEFAULTS.items()}


@router.get("/content")
def public_content(db: Session = Depends(get_db)):
    return _content(db)


@router.get("/admin/content")
def admin_content(admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    rows = {c.key: c for c in db.scalars(select(SiteContent))}
    return {"content": _content(db), "defaults": CONTENT_DEFAULTS,
            "updated": {k: {"at": r.updated_at} for k, r in rows.items()}}


@router.put("/admin/content/{key}")
def put_content(key: str, value: dict[str, Any], request: Request, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    if key not in CONTENT_DEFAULTS:
        raise HTTPException(404, "Unknown content section.")
    allowed = set(CONTENT_DEFAULTS[key])
    clean = {k: v for k, v in value.items() if k in allowed}
    row = db.get(SiteContent, key)
    if row:
        row.value, row.updated_by = clean, admin.id
    else:
        db.add(SiteContent(key=key, value=clean, updated_by=admin.id))
    audit(db, admin.id, "admin.content_updated", "content", key, ip=client_ip(request))
    db.commit()
    return {"ok": True, "content": _content(db)[key]}


@router.delete("/admin/content/{key}")
def reset_content(key: str, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    row = db.get(SiteContent, key)
    if row:
        db.delete(row)
        audit(db, admin.id, "admin.content_reset", "content", key)
        db.commit()
    return {"ok": True}


# ------------------------------------------------------------------ export


def _dataset(db: Session, name: str) -> tuple[list[str], list[list]]:
    if name == "customers":
        cols = ["id", "email", "full_name", "stage", "plan", "interval", "mrr", "lifetime_revenue", "renews_at",
                "cancel_at_period_end", "applications", "resumes", "ai_calls", "engagement", "tags", "follow_up_at",
                "notes", "open_tasks", "profile_type", "city", "current_title", "target_title", "account_status", "email_verified", "onboarded", "created_at",
                "last_seen_at"]
        rows = [r for r in _customer_rows(db)]
        return cols, [[", ".join(r[c]) if c == "tags" else r.get(c) for c in cols] for r in rows]
    emails = dict(db.execute(select(User.id, User.email)).all())
    if name == "payments":
        cols = ["created_at", "email", "amount_usd", "status", "description", "is_test", "id"]
        ps = db.scalars(select(Payment).order_by(Payment.created_at.desc())).all()
        return cols, [[p.created_at, emails.get(p.user_id), p.amount_cents / 100, p.status, p.description, p.is_test, str(p.id)] for p in ps]
    if name == "subscriptions":
        cols = ["created_at", "email", "plan", "interval", "status", "provider", "period_start", "period_end", "cancel_at_period_end", "id"]
        ss = db.scalars(select(Subscription).order_by(Subscription.created_at.desc())).all()
        return cols, [[s.created_at, emails.get(s.user_id), s.plan_slug, s.interval, s.status, s.provider, s.current_period_start,
                       s.current_period_end, s.cancel_at_period_end, str(s.id)] for s in ss]
    if name == "applications":
        cols = ["updated_at", "email", "job_title", "company", "status", "created_at", "id"]
        aa = db.scalars(select(JobApplication).order_by(JobApplication.updated_at.desc())).all()
        return cols, [[a.updated_at, emails.get(a.user_id), a.job_title, a.company_name, a.status, a.created_at, str(a.id)] for a in aa]
    if name == "jobs":
        cols = ["fetched_at", "title", "company", "location", "source", "salary_min", "salary_max", "salary_period", "category",
                "is_active", "url", "id"]
        jj = db.scalars(select(Job).order_by(Job.fetched_at.desc()).limit(50000)).all()
        return cols, [[j.fetched_at, j.title, j.company, j.location, j.source_kind, j.salary_min, j.salary_max, j.salary_period,
                       j.category, j.is_active, j.url, str(j.id)] for j in jj]
    if name == "notes":
        cols = ["created_at", "customer", "kind", "body", "due_at", "done", "author"]
        nn = db.scalars(select(CrmNote).order_by(CrmNote.created_at.desc())).all()
        return cols, [[n.created_at, emails.get(n.user_id), n.kind, n.body, n.due_at, n.done, emails.get(n.author_id)] for n in nn]
    if name == "ai_calls":
        cols = ["created_at", "email", "task", "model", "status", "input_tokens", "output_tokens", "latency_ms"]
        cc = db.scalars(select(AICall).order_by(AICall.created_at.desc()).limit(50000)).all()
        return cols, [[c.created_at, emails.get(c.user_id), c.task, c.model, c.status, c.input_tokens, c.output_tokens, c.latency_ms] for c in cc]
    if name == "audit_logs":
        cols = ["created_at", "actor", "action", "entity_type", "entity_id", "ip", "details"]
        ll = db.scalars(select(AuditLog).order_by(AuditLog.created_at.desc()).limit(50000)).all()
        return cols, [[l.created_at, emails.get(l.actor_id), l.action, l.entity_type, l.entity_id, l.ip, str(l.details or {})] for l in ll]
    if name == "plans":
        cols = ["slug", "name", "price_month_usd", "price_year_usd", "is_active", "limits", "features"]
        pp = db.scalars(select(Plan).order_by(Plan.sort)).all()
        return cols, [[p.slug, p.name, p.price_month_cents / 100, p.price_year_cents / 100, p.is_active, str(p.limits), "; ".join(p.features or [])] for p in pp]
    raise HTTPException(404, "Unknown dataset.")


DATASETS = ["customers", "payments", "subscriptions", "applications", "jobs", "notes", "ai_calls", "audit_logs", "plans"]


def _cell(v):
    if isinstance(v, datetime):
        v = _aware(v)
        return v.strftime("%Y-%m-%d %H:%M") if v else ""
    if isinstance(v, uuid.UUID):
        return str(v)
    return "" if v is None else v


@router.get("/admin/export/{name}")
def export(name: str, format: Literal["csv", "xlsx"] = "csv", request: Request = None,
           admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    if name not in DATASETS:
        raise HTTPException(404, "Unknown dataset.")
    cols, rows = _dataset(db, name)
    stamp = utcnow().strftime("%Y-%m-%d")
    audit(db, admin.id, "admin.export", "dataset", name, ip=client_ip(request) if request else None, format=format, rows=len(rows))
    db.commit()
    fname = f"bespoke-{name}-{stamp}.{format}"
    if format == "csv":
        buf = io.StringIO()
        w = csv.writer(buf)
        w.writerow(cols)
        for r in rows:
            w.writerow([_cell(v) for v in r])
        # BOM so Excel opens UTF-8 correctly
        return Response("﻿" + buf.getvalue(), media_type="text/csv; charset=utf-8",
                        headers={"Content-Disposition": f'attachment; filename="{fname}"'})
    from openpyxl import Workbook
    from openpyxl.styles import Font
    from openpyxl.utils import get_column_letter
    wb = Workbook()
    ws = wb.active
    ws.title = name[:31]
    ws.append(cols)
    for c in ws[1]:
        c.font = Font(bold=True)
    for r in rows:
        ws.append([_cell(v) for v in r])
    ws.freeze_panes = "A2"
    ws.auto_filter.ref = ws.dimensions
    for i, col in enumerate(cols, 1):
        width = max([len(str(col))] + [len(str(_cell(r[i - 1]))) for r in rows[:500]])
        ws.column_dimensions[get_column_letter(i)].width = min(60, max(10, width + 2))
    out = io.BytesIO()
    wb.save(out)
    return Response(out.getvalue(), media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    headers={"Content-Disposition": f'attachment; filename="{fname}"'})
