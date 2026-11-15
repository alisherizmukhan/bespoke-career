"""Admin & knowledge management: users, plans, job sources, knowledge records, AI usage, audit log, metrics."""
import threading
import uuid
from ..safety import like
from datetime import date, timedelta
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from ..db import get_db
from ..ingest import runner
from ..ingest.sources import ATTRIBUTION, FETCHERS
from ..models import (AICall, AssistantMessage, AuditLog, IngestionRun, Job, JobApplication, JobSource, Payment, Plan,
                      Resume, ResumeGuideline, ResumeVersion, SalaryAssessment, Subscription, UsageRecord, User, UserProfile, utcnow)
from ..security import client_ip, require_admin
from ..services import audit

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/metrics")
def metrics(admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    now = utcnow()
    c = lambda s: db.scalar(s) or 0  # noqa: E731
    paying = db.execute(select(Subscription.plan_slug, Subscription.interval, func.count())
                        .where(Subscription.status == "active").group_by(Subscription.plan_slug, Subscription.interval)).all()
    prices = {p.slug: p for p in db.scalars(select(Plan))}
    mrr = 0.0
    for slug, interval, n in paying:
        p = prices.get(slug)
        if p:
            mrr += n * (p.price_year_cents / 12 if interval == "year" else p.price_month_cents) / 100
    users = c(select(func.count(User.id)).where(User.role == "user", User.account_status != "deleted"))
    paying_n = sum(n for *_, n in paying)
    weekly = []
    for i in range(7, -1, -1):
        s = now - timedelta(weeks=i + 1)
        e = now - timedelta(weeks=i)
        weekly.append({"period": e.date().isoformat(),
                       "signups": c(select(func.count(User.id)).where(User.created_at >= s, User.created_at < e)),
                       "applications": c(select(func.count(JobApplication.id)).where(JobApplication.created_at >= s, JobApplication.created_at < e))})
    return {
        "users": users, "activated": c(select(func.count(UserProfile.id)).where(UserProfile.onboarding_completed.is_(True))),
        "dau": c(select(func.count(User.id)).where(User.last_login_at >= now - timedelta(days=1))),
        "mau": c(select(func.count(User.id)).where(User.last_login_at >= now - timedelta(days=30))),
        "resumes": c(select(func.count(Resume.id))), "resume_versions": c(select(func.count(ResumeVersion.id))),
        "salary_assessments": c(select(func.count(SalaryAssessment.id))), "applications": c(select(func.count(JobApplication.id))),
        "assistant_messages": c(select(func.count(AssistantMessage.id)).where(AssistantMessage.role == "user")),
        "paying": paying_n, "mrr": round(mrr, 2), "arr": round(mrr * 12, 2),
        "arpa": round(mrr / paying_n, 2) if paying_n else 0,
        "conversion": round(100 * paying_n / users, 1) if users else 0,
        "plan_mix": [{"plan": s, "interval": i, "count": n} for s, i, n in paying],
        "jobs_active": c(select(func.count(Job.id)).where(Job.is_active.is_(True))),
        "ai_calls_30d": c(select(func.count(AICall.id)).where(AICall.created_at >= now - timedelta(days=30))),
        "weekly": weekly, "billing_mode": "test",
    }


# ------------------------------------------------------------------ users


@router.get("/users")
def users(q: str | None = None, status: str | None = None, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    stmt = select(User, UserProfile).outerjoin(UserProfile, UserProfile.user_id == User.id).order_by(User.created_at.desc())
    if q:
        stmt = stmt.where(or_(User.email.ilike(like(q), escape="\\"), UserProfile.full_name.ilike(like(q), escape="\\")))
    if status:
        stmt = stmt.where(User.account_status == status)
    subs = {s.user_id: s.plan_slug for s in db.scalars(select(Subscription).where(Subscription.status == "active"))}
    return [{"id": str(u.id), "email": u.email, "role": u.role, "status": u.account_status, "full_name": p.full_name if p else "",
             "profile_type": p.profile_type if p else None, "plan": subs.get(u.id, "free"), "created_at": u.created_at,
             "last_login_at": u.last_login_at, "email_verified": u.email_verified_at is not None}
            for u, p in db.execute(stmt.limit(500)).all()]


class UserAction(BaseModel):
    action: Literal["suspend", "restore", "make_admin", "grant_plan", "reset_usage"]
    plan: str | None = None


@router.patch("/users/{uid}")
def user_action(uid: uuid.UUID, body: UserAction, request: Request, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    u = db.get(User, uid)
    if not u:
        raise HTTPException(404, "User not found.")
    if u.id == admin.id and body.action == "suspend":
        raise HTTPException(409, "You can't suspend yourself.")
    if body.action == "suspend":
        u.account_status = "suspended"
        u.tokens_valid_after = utcnow()
    elif body.action == "restore":
        u.account_status = "active"
    elif body.action == "make_admin":
        u.role = "admin"
    elif body.action == "reset_usage":
        # Gives the user their full monthly allowance again (support goodwill, demos)
        from ..entitlements import period
        db.query(UsageRecord).filter(UsageRecord.user_id == u.id, UsageRecord.period == period()).delete()
    elif body.action == "grant_plan":
        if not db.scalar(select(Plan).where(Plan.slug == body.plan)):
            raise HTTPException(404, "Plan not found.")
        for s in db.scalars(select(Subscription).where(Subscription.user_id == u.id, Subscription.status == "active")):
            s.status = "canceled"
        if body.plan != "free":
            db.add(Subscription(user_id=u.id, plan_slug=body.plan, status="active", provider="admin_grant",
                                current_period_end=utcnow() + timedelta(days=30)))
    audit(db, admin.id, f"admin.user_{body.action}", "user", u.id, ip=client_ip(request), plan=body.plan)
    db.commit()
    return {"ok": True}


# ------------------------------------------------------------------ plans & entitlements


class PlanIn(BaseModel):
    name: str | None = Field(None, max_length=60)
    tagline: str | None = Field(None, max_length=200)
    price_month: float | None = Field(None, ge=0, le=10000)
    price_year: float | None = Field(None, ge=0, le=100000)
    limits: dict[str, int] | None = None
    features: list[str] | None = None
    is_active: bool | None = None


@router.get("/plans")
def plans(admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    from .billing import plan_out
    return [{**plan_out(p), "is_active": p.is_active} for p in db.scalars(select(Plan).order_by(Plan.sort))]


@router.patch("/plans/{slug}")
def update_plan(slug: str, body: PlanIn, request: Request, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    p = db.scalar(select(Plan).where(Plan.slug == slug))
    if not p:
        raise HTTPException(404, "Plan not found.")
    before = {"price_month": p.price_month_cents, "price_year": p.price_year_cents, "limits": p.limits}
    d = body.model_dump(exclude_unset=True)
    if "price_month" in d:
        p.price_month_cents = int(round(d.pop("price_month") * 100))
    if "price_year" in d:
        p.price_year_cents = int(round(d.pop("price_year") * 100))
    if "limits" in d:
        p.limits = {**(p.limits or {}), **d.pop("limits")}
    for k, v in d.items():
        setattr(p, k, v)
    audit(db, admin.id, "admin.plan_updated", "plan", p.slug, ip=client_ip(request), before=before)
    db.commit()
    return {"ok": True}


# ------------------------------------------------------------------ job sources (ingestion)


class SourceIn(BaseModel):
    kind: Literal["talent", "greenhouse", "ashby", "lever", "remotive", "remoteok", "himalayas", "jobicy", "adzuna", "usajobs", "telegram"]
    name: str = Field(min_length=2, max_length=160)
    config: dict = Field(default_factory=dict)
    is_active: bool = True


class SourcePatch(BaseModel):
    name: str | None = Field(None, max_length=160)
    config: dict | None = None
    is_active: bool | None = None


def source_out(db: Session, s: JobSource) -> dict:
    return {"id": str(s.id), "kind": s.kind, "provider": ATTRIBUTION.get(s.kind, s.kind), "name": s.name, "config": s.config,
            "is_active": s.is_active, "last_run_at": s.last_run_at, "last_status": s.last_status, "last_error": s.last_error,
            "last_found": s.last_found, "last_created": s.last_created,
            "active_jobs": db.scalar(select(func.count(Job.id)).where(Job.source_id == s.id, Job.is_active.is_(True))) or 0}


@router.get("/job-sources")
def job_sources(admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    runner.ensure_default_sources(db)
    runs = db.scalars(select(IngestionRun).order_by(IngestionRun.started_at.desc()).limit(40)).all()
    return {"sources": [source_out(db, s) for s in db.scalars(select(JobSource).order_by(JobSource.kind, JobSource.name))],
            "recent_runs": [{"source": r.source_name, "status": r.status, "started_at": r.started_at, "finished_at": r.finished_at,
                             "fetched": r.fetched, "created": r.created, "updated": r.updated, "error": r.error} for r in runs],
            "kinds": [{"kind": k, "name": ATTRIBUTION[k]} for k in FETCHERS]}


@router.post("/job-sources", status_code=201)
def add_source(body: SourceIn, request: Request, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    s = JobSource(kind=body.kind, name=body.name, config=body.config, is_active=body.is_active)
    db.add(s)
    audit(db, admin.id, "admin.job_source_created", "job_source", None, ip=client_ip(request), kind=body.kind, name=body.name)
    db.commit()
    return source_out(db, s)


@router.patch("/job-sources/{sid}")
def patch_source(sid: uuid.UUID, body: SourcePatch, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    s = db.get(JobSource, sid)
    if not s:
        raise HTTPException(404, "Source not found.")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(s, k, v)
    audit(db, admin.id, "admin.job_source_updated", "job_source", s.id)
    db.commit()
    return source_out(db, s)


@router.delete("/job-sources/{sid}")
def delete_source(sid: uuid.UUID, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    s = db.get(JobSource, sid)
    if not s:
        raise HTTPException(404, "Source not found.")
    db.delete(s)
    audit(db, admin.id, "admin.job_source_deleted", "job_source", sid)
    db.commit()
    return {"ok": True}


_run_lock = threading.Lock()


@router.post("/job-sources/run")
def run_sources(source: str | None = None, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    if not _run_lock.acquire(blocking=False):
        raise HTTPException(409, "An ingestion run is already in progress.")

    def work():
        try:
            runner.run_all(source, force=True)
        finally:
            _run_lock.release()

    threading.Thread(target=work, daemon=True).start()
    audit(db, admin.id, "admin.ingestion_started", "job_source", source)
    db.commit()
    return {"started": True}


# ------------------------------------------------------------------ knowledge records


class GuidelineIn(BaseModel):
    industry_slug: str | None = None
    occupation: str | None = None
    document_type: str | None = None
    country: str | None = "US"
    category: Literal["legal", "employer", "association", "convention", "best_practice"]
    text: str = Field(min_length=10, max_length=3000)
    source_url: str | None = None
    source_type: str | None = None
    confidence: Literal["low", "medium", "high"] = "medium"
    is_verified: bool = False


def g_out(g: ResumeGuideline) -> dict:
    d = {c.name: getattr(g, c.name) for c in ResumeGuideline.__table__.columns}
    d["id"] = str(g.id)
    return d


@router.get("/knowledge/guidelines")
def guidelines(admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    return [g_out(g) for g in db.scalars(select(ResumeGuideline).order_by(ResumeGuideline.updated_at.desc()))]


@router.post("/knowledge/guidelines", status_code=201)
def add_guideline(body: GuidelineIn, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    g = ResumeGuideline(**body.model_dump(), last_verified=date.today() if body.is_verified else None)
    db.add(g)
    audit(db, admin.id, "admin.guideline_created", "guideline", None)
    db.commit()
    return g_out(g)


@router.patch("/knowledge/guidelines/{gid}")
def edit_guideline(gid: uuid.UUID, body: GuidelineIn, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    g = db.get(ResumeGuideline, gid)
    if not g:
        raise HTTPException(404, "Guideline not found.")
    for k, v in body.model_dump().items():
        setattr(g, k, v)
    g.version += 1
    if body.is_verified:
        g.last_verified = date.today()
    audit(db, admin.id, "admin.guideline_updated", "guideline", g.id, version=g.version)
    db.commit()
    return g_out(g)


# ------------------------------------------------------------------ AI usage & audit


@router.get("/ai-usage")
def ai_usage(days: int = Query(30, ge=1, le=365), admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    since = utcnow() - timedelta(days=days)
    rows = db.execute(select(AICall.task, AICall.status, func.count(), func.sum(AICall.input_tokens), func.sum(AICall.output_tokens),
                             func.avg(AICall.latency_ms)).where(AICall.created_at >= since).group_by(AICall.task, AICall.status)).all()
    from ..config import get_settings
    st = get_settings()
    return {"provider": st.ai_provider, "model": st.ai_model, "enabled": st.ai_enabled,
            "rows": [{"task": t, "status": s, "calls": n, "input_tokens": int(i or 0), "output_tokens": int(o or 0),
                      "avg_latency_ms": int(l or 0)} for t, s, n, i, o, l in rows]}


@router.get("/audit-logs")
def audit_logs(action: str | None = None, limit: int = Query(200, le=1000), admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    stmt = select(AuditLog).order_by(AuditLog.created_at.desc())
    if action:
        stmt = stmt.where(AuditLog.action.like(f"{action}%"))
    logs = db.scalars(stmt.limit(limit)).all()
    emails = {u.id: u.email for u in db.scalars(select(User).where(User.id.in_({l.actor_id for l in logs if l.actor_id} or {uuid.uuid4()})))}
    return [{"id": str(l.id), "actor": emails.get(l.actor_id, "system"), "action": l.action, "entity_type": l.entity_type,
             "entity_id": l.entity_id, "details": l.details, "ip": l.ip, "created_at": l.created_at} for l in logs]


@router.get("/payments")
def payments(admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    ps = db.execute(select(Payment, User.email).join(User, User.id == Payment.user_id).order_by(Payment.created_at.desc()).limit(300)).all()
    return [{"id": str(p.id), "email": e, "amount": p.amount_cents / 100, "status": p.status, "description": p.description,
             "is_test": p.is_test, "created_at": p.created_at} for p, e in ps]
