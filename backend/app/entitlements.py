"""Central entitlement service: plan lookup, monthly usage, limit checks.
Limits live on the Plan rows (editable by admins); -1 means unlimited, 0 means not included."""
from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .models import JobApplication, Plan, Subscription, UsageRecord, User, utcnow

FEATURES = {
    "resume_generation": "Resume generations & adaptations",
    "resume_analysis": "Resume & ATS analyses",
    "applications": "Tracked job applications",
    "salary_assessment": "Personal salary assessments",
    "salary_negotiation": "Salary negotiation assistant",
    "assistant_messages": "AI Career Assistant messages",
    "voice_interviews": "AI voice interviews",
    "family_seats": "Additional family / student seats",
}

PLAN_DEFAULTS = [
    {"slug": "free", "name": "Free", "sort": 0, "price_month_cents": 0, "price_year_cents": 0,
     "tagline": "Get started and see where you stand.",
     "limits": {"resume_generation": 3, "resume_analysis": 3, "applications": 5, "salary_assessment": 1,
                "salary_negotiation": 0, "assistant_messages": 20, "voice_interviews": 1, "family_seats": 0},
     "features": ["Up to 3 resume generations", "Basic resume analysis", "Up to 5 tracked applications",
                  "One salary estimate", "AI Career Assistant (20 messages)"]},
    {"slug": "plus", "name": "Career Plus", "sort": 1, "price_month_cents": 1900, "price_year_cents": 14400,
     "tagline": "For active job seekers applying every week.",
     "limits": {"resume_generation": 20, "resume_analysis": 50, "applications": 100, "salary_assessment": 10,
                "salary_negotiation": 0, "assistant_messages": 300, "voice_interviews": 5, "family_seats": 1},
     "features": ["20 resume generations / month", "Full Resume Intelligence + ATS optimization",
                  "Up to 100 tracked applications", "Extended Salary Intelligence", "5 voice interviews / month",
                  "One student seat"]},
    {"slug": "pro", "name": "Career Pro", "sort": 2, "price_month_cents": 3900, "price_year_cents": 28800,
     "tagline": "Everything you need to land and negotiate the offer.",
     "limits": {"resume_generation": 100, "resume_analysis": -1, "applications": -1, "salary_assessment": -1,
                "salary_negotiation": -1, "assistant_messages": 1000, "voice_interviews": 20, "family_seats": 2},
     "features": ["Advanced ATS analysis & multiple versions", "Unlimited job tracking", "Full Salary Intelligence",
                  "Salary Negotiation Assistant", "20 voice interviews / month", "Priority AI Career Assistant",
                  "Two student seats"]},
    {"slug": "family", "name": "Career Family", "sort": 3, "price_month_cents": 5900, "price_year_cents": 44400,
     "tagline": "Career Pro for you, plus the people you care about.",
     "limits": {"resume_generation": 100, "resume_analysis": -1, "applications": -1, "salary_assessment": -1,
                "salary_negotiation": -1, "assistant_messages": 1000, "voice_interviews": 20, "family_seats": 3},
     "features": ["All Career Pro features", "Up to 3 additional family profiles", "Student Career Intelligence",
                  "Separate, private profiles and documents"]},
]


def period() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m")


def active_subscription(db: Session, user: User) -> Subscription | None:
    s = db.scalar(select(Subscription).where(Subscription.user_id == user.id,
                                             Subscription.status.in_(["active", "past_due"]))
                  .order_by(Subscription.created_at.desc()))
    if s:
        end = s.current_period_end if s.current_period_end.tzinfo else s.current_period_end.replace(tzinfo=timezone.utc)
        if end < utcnow():
            if s.cancel_at_period_end:
                s.status = "expired"
                db.commit()
                return None
            # test-mode renewal: roll the period forward
            from .routers.billing import renew_test_subscription
            renew_test_subscription(db, s)
    return s


def current_plan(db: Session, user: User) -> Plan:
    s = active_subscription(db, user)
    slug = s.plan_slug if s else "free"
    plan = db.scalar(select(Plan).where(Plan.slug == slug)) or db.scalar(select(Plan).where(Plan.slug == "free"))
    if plan is None:  # unseeded DB (tests)
        d = PLAN_DEFAULTS[0]
        plan = Plan(slug=d["slug"], name=d["name"], limits=d["limits"], features=d["features"])
    return plan


def used(db: Session, user: User, feature: str) -> int:
    if feature == "applications":
        return db.scalar(select(func.count(JobApplication.id)).where(JobApplication.user_id == user.id)) or 0
    r = db.scalar(select(UsageRecord).where(UsageRecord.user_id == user.id, UsageRecord.feature == feature,
                                            UsageRecord.period == period()))
    return r.count if r else 0


def snapshot(db: Session, user: User) -> dict:
    plan = current_plan(db, user)
    out = {}
    for f, label in FEATURES.items():
        limit = int((plan.limits or {}).get(f, 0))
        out[f] = {"label": label, "limit": limit, "used": used(db, user, f) if f != "family_seats" else 0,
                  "unlimited": limit < 0}
    return {"plan": {"slug": plan.slug, "name": plan.name}, "period": period(), "features": out}


def check(db: Session, user: User, feature: str, amount: int = 1) -> None:
    if user.role == "admin":
        return
    plan = current_plan(db, user)
    limit = int((plan.limits or {}).get(feature, 0))
    if limit < 0:
        return
    if limit == 0:
        raise HTTPException(402, {"code": "feature_not_included", "feature": feature, "plan": plan.slug,
                                  "message": f"{FEATURES.get(feature, feature)} isn't included in {plan.name}. Upgrade to unlock it."})
    if used(db, user, feature) + amount > limit:
        raise HTTPException(402, {"code": "limit_reached", "feature": feature, "plan": plan.slug, "limit": limit,
                                  "message": f"You've used all {limit} {FEATURES.get(feature, feature).lower()} on {plan.name} "
                                             f"this month. Upgrade for more."})


def consume(db: Session, user: User, feature: str, amount: int = 1) -> None:
    if feature == "applications":
        return
    r = db.scalar(select(UsageRecord).where(UsageRecord.user_id == user.id, UsageRecord.feature == feature,
                                            UsageRecord.period == period()))
    if not r:
        r = UsageRecord(user_id=user.id, feature=feature, period=period(), count=0)
        db.add(r)
    r.count += amount
