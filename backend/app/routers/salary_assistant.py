"""Salary Intelligence endpoints and the AI Career Assistant."""
import json
import uuid
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from .. import entitlements, salary
from ..ai import provider
from ..db import get_db
from ..models import (ApplicationInterview, AssistantConversation, AssistantMessage, Job, JobApplication, Reminder, Resume,
                      ResumeAnalysis, SalaryAssessment, SavedJob, User, UserProfile, UserSkill, utcnow)
from ..security import get_current_user, rate_limit

router = APIRouter(tags=["salary", "assistant"])


def _profile(db, user):
    return db.scalar(select(UserProfile).where(UserProfile.user_id == user.id))


# ------------------------------------------------------------------ salary


class MarketIn(BaseModel):
    title: str = Field(min_length=2, max_length=120)
    location: str | None = Field(None, max_length=120)
    seniority: str | None = None
    employment_type: str | None = None


@router.post("/salary-intelligence/market-research")
def market(body: MarketIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rate_limit(f"salary:{user.id}", 30, 60)
    return salary.public(salary.market_research(db, body.title, body.location, body.seniority, body.employment_type))


class AssessIn(BaseModel):
    title: str | None = Field(None, max_length=120)
    location: str | None = Field(None, max_length=120)


@router.post("/salary-intelligence/assess", status_code=201)
def assess(body: AssessIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    entitlements.check(db, user, "salary_assessment")
    res = salary.assess(db, user, _profile(db, user), body.title, body.location)
    if "error" in res:
        raise HTTPException(422, res["error"])
    if "estimate" not in res:
        return res
    a = SalaryAssessment(user_id=user.id, occupation=res["title"], location=res["location"], currency="USD",
                         low=res["estimate"]["low"], mid=res["estimate"]["mid"], high=res["estimate"]["high"],
                         confidence=res["confidence"], market=res["market"],
                         explanation={k: res.get(k) for k in ("factors", "missing_information", "explanation", "seniority")})
    db.add(a)
    entitlements.consume(db, user, "salary_assessment")
    db.commit()
    return {"id": str(a.id), **res}


@router.get("/salary-intelligence/assessment/{aid}")
def get_assessment(aid: uuid.UUID, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    a = db.get(SalaryAssessment, aid)
    if not a or a.user_id != user.id:
        raise HTTPException(404, "Assessment not found.")
    return {"id": str(a.id), "title": a.occupation, "location": a.location, "currency": a.currency,
            "estimate": {"low": a.low, "mid": a.mid, "high": a.high}, "confidence": a.confidence, "market": a.market,
            **(a.explanation or {}), "created_at": a.created_at}


@router.get("/salary-intelligence/history")
def salary_history(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.scalars(select(SalaryAssessment).where(SalaryAssessment.user_id == user.id).order_by(SalaryAssessment.created_at.desc())).all()
    return [{"id": str(a.id), "title": a.occupation, "location": a.location, "estimate": {"low": a.low, "mid": a.mid, "high": a.high},
             "confidence": a.confidence, "created_at": a.created_at} for a in rows]


@router.post("/salary-intelligence/growth-plan")
def growth(body: AssessIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    res = salary.growth_plan(db, user, _profile(db, user), body.title)
    if "error" in res:
        raise HTTPException(422, res["error"])
    return res


class NegotiateIn(BaseModel):
    title: str = Field(min_length=2, max_length=120)
    location: str | None = Field(None, max_length=120)
    base: float = Field(gt=1000, lt=5_000_000)
    bonus: float = Field(0, ge=0)
    equity_yearly: float = Field(0, ge=0)
    notes: str = Field("", max_length=3000)


@router.post("/salary-intelligence/negotiate")
def negotiate(body: NegotiateIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    entitlements.check(db, user, "salary_negotiation")
    res = salary.negotiate(db, user, _profile(db, user), body.title, body.location, body.base, body.bonus,
                           body.equity_yearly, body.notes)
    if "error" in res:
        raise HTTPException(422, res["error"])
    entitlements.consume(db, user, "salary_negotiation")
    db.commit()
    return res


# ------------------------------------------------------------------ assistant


def matching_jobs(db: Session, p: UserProfile | None, limit: int = 6) -> list[Job]:
    title = (p.target_title or p.current_title or p.occupation) if p else None
    if not title:
        return []
    words = [w for w in title.split() if len(w) > 2][:3]
    stmt = select(Job).where(Job.is_active.is_(True), Job.is_duplicate.is_(False))
    for w in words:
        stmt = stmt.where(Job.title.ilike(f"%{w}%"))
    if p.city:
        stmt = stmt.order_by(Job.location.ilike(f"%{p.city}%").desc(), Job.published_at.desc().nullslast())
    else:
        stmt = stmt.order_by(Job.published_at.desc().nullslast())
    return db.scalars(stmt.limit(limit)).all()


def build_context(db: Session, user: User) -> dict:
    """Only this user's own records — never another account's data."""
    p = _profile(db, user)
    now = utcnow()
    apps = db.scalars(select(JobApplication).where(JobApplication.user_id == user.id).order_by(JobApplication.updated_at.desc()).limit(40)).all()
    interviews = db.execute(select(ApplicationInterview, JobApplication).join(JobApplication, JobApplication.id == ApplicationInterview.application_id)
                            .where(JobApplication.user_id == user.id, ApplicationInterview.scheduled_at >= now - timedelta(days=1))
                            .order_by(ApplicationInterview.scheduled_at).limit(10)).all()
    reminders = db.scalars(select(Reminder).where(Reminder.user_id == user.id, Reminder.done_at.is_(None)).order_by(Reminder.due_at).limit(15)).all()
    resumes = db.scalars(select(Resume).where(Resume.user_id == user.id).order_by(Resume.updated_at.desc()).limit(5)).all()
    sal = db.scalar(select(SalaryAssessment).where(SalaryAssessment.user_id == user.id).order_by(SalaryAssessment.created_at.desc()))
    saved = db.scalars(select(Job).join(SavedJob, SavedJob.job_id == Job.id).where(SavedJob.user_id == user.id).limit(10)).all()
    skills = [s.skill for s in db.scalars(select(UserSkill).where(UserSkill.user_id == user.id))]

    def scores(r):
        a = db.scalar(select(ResumeAnalysis).where(ResumeAnalysis.resume_id == r.id).order_by(ResumeAnalysis.created_at.desc()))
        return {"title": r.title, "status": r.status, "document_type": r.document_type,
                "last_score": a.score if a else None,
                "last_missing_keywords": (a.result.get("keywords", {}).get("missing_required", [])[:10] if a else [])}
    return {
        "today": now.date().isoformat(),
        "profile": {"name": p.full_name, "type": p.profile_type, "title": p.current_title, "target_title": p.target_title,
                    "industry": p.industry, "years_experience": p.years_experience, "location": ", ".join(x for x in [p.city, p.country] if x),
                    "goals": p.career_goals, "target_salary": [p.salary_min, p.salary_max], "skills": skills} if p else {},
        "applications": [{"company": a.company_name, "title": a.job_title, "status": a.status,
                          "applied_at": a.applied_at.isoformat() if a.applied_at else None,
                          "last_update_days_ago": (now - (a.updated_at if a.updated_at.tzinfo else a.updated_at.replace(tzinfo=now.tzinfo))).days}
                         for a in apps],
        "upcoming_interviews": [{"company": a.company_name, "title": i.title, "type": i.type,
                                 "at": i.scheduled_at.isoformat(), "notes": (i.notes or "")[:300]} for i, a in interviews],
        "open_reminders": [{"title": r.title, "due": r.due_at.isoformat()} for r in reminders],
        "resumes": [scores(r) for r in resumes],
        "latest_salary_estimate": {"title": sal.occupation, "low": sal.low, "mid": sal.mid, "high": sal.high,
                                   "location": sal.location, "confidence": sal.confidence} if sal else None,
        "saved_jobs": [{"title": j.title, "company": j.company, "location": j.location} for j in saved],
        "matching_open_jobs": [{"title": j.title, "company": j.company, "location": j.location,
                                "salary": [j.salary_min, j.salary_max, j.salary_period], "url": j.url}
                               for j in matching_jobs(db, p)],
    }


def rule_based_reply(q: str, ctx: dict) -> str:
    ql = q.lower()
    apps = ctx["applications"]
    if any(w in ql for w in ("respond", "follow", "heard back", "waiting", "ghost")):
        waiting = [a for a in apps if a["status"] in ("applied", "viewed") and a["last_update_days_ago"] >= 7]
        if not waiting:
            return "None of your applications have been waiting more than a week. Nice — nothing to chase right now."
        lines = [f"• {a['company']} — {a['title']} ({a['last_update_days_ago']} days since the last update)" for a in waiting[:8]]
        return "These applications haven't moved in a week or more. A short, polite follow-up is reasonable:\n" + "\n".join(lines)
    if "interview" in ql:
        iv = ctx["upcoming_interviews"]
        if not iv:
            return "You have no upcoming interviews in your tracker. Add one from an application to get reminders."
        return "Your upcoming interviews:\n" + "\n".join(f"• {i['at'][:16].replace('T', ' ')} — {i['company']}: {i['title']}" for i in iv) + \
               "\n\nPrepare 3 STAR stories (situation, task, action, result) that match the job description for each."
    if any(w in ql for w in ("salary", "earn", "pay", "worth")):
        s = ctx["latest_salary_estimate"]
        if not s:
            return "Run a salary assessment from Salary Intelligence first; then I can compare your estimate with your goals."
        return f"Your latest estimate for {s['title']} in {s['location']}: ${s['low']:,.0f}–${s['high']:,.0f} (midpoint ${s['mid']:,.0f}, {s['confidence']} confidence)."
    if any(w in ql for w in ("apply", "jobs", "openings", "vacanc")):
        jobs = ctx["matching_open_jobs"]
        if not jobs:
            return "Set a target job title in your profile and I'll match open jobs to it."
        return "Open jobs that match your target title:\n" + "\n".join(f"• {j['title']} — {j['company']} ({j['location']})" for j in jobs)
    if any(w in ql for w in ("skill", "missing", "learn")):
        miss = sorted({k for r in ctx["resumes"] for k in r["last_missing_keywords"]})
        return ("From your last resume analysis, these job requirements weren't found in your resume: " + ", ".join(miss)
                if miss else "Run an ATS analysis against a job description to see which skills are missing.")
    focus = []
    if ctx["upcoming_interviews"]:
        focus.append(f"Prepare for your interview with {ctx['upcoming_interviews'][0]['company']}.")
    if any(a["status"] in ("applied", "viewed") and a["last_update_days_ago"] >= 7 for a in apps):
        focus.append("Follow up on applications waiting more than a week.")
    if not ctx["resumes"]:
        focus.append("Upload your resume so we can analyze and tailor it.")
    if len([a for a in apps if a["status"] == "interested"]) > 0:
        focus.append("Turn saved “Interested” jobs into applications.")
    return ("Here's what I'd focus on this week:\n" + "\n".join(f"• {f}" for f in focus)) if focus else \
        "Ask me about your applications, interviews, salary, missing skills or which jobs to apply for."


class AskIn(BaseModel):
    conversation_id: uuid.UUID | None = None
    message: str = Field(min_length=1, max_length=4000)


@router.post("/assistant/conversations", status_code=201)
def new_conversation(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    c = AssistantConversation(user_id=user.id)
    db.add(c)
    db.commit()
    return {"id": str(c.id), "title": c.title, "created_at": c.created_at}


@router.get("/assistant/conversations")
def conversations(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    cs = db.scalars(select(AssistantConversation).where(AssistantConversation.user_id == user.id)
                    .order_by(AssistantConversation.updated_at.desc()).limit(50)).all()
    return [{"id": str(c.id), "title": c.title, "updated_at": c.updated_at} for c in cs]


@router.get("/assistant/conversations/{cid}")
def conversation(cid: uuid.UUID, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    c = db.get(AssistantConversation, cid)
    if not c or c.user_id != user.id:
        raise HTTPException(404, "Conversation not found.")
    msgs = db.scalars(select(AssistantMessage).where(AssistantMessage.conversation_id == c.id).order_by(AssistantMessage.created_at)).all()
    return {"id": str(c.id), "title": c.title, "messages": [{"id": str(m.id), "role": m.role, "content": m.content,
                                                              "created_at": m.created_at} for m in msgs]}


@router.post("/assistant/messages")
def ask(body: AskIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rate_limit(f"assistant:{user.id}", 20, 60)
    entitlements.check(db, user, "assistant_messages")
    if body.conversation_id:
        c = db.get(AssistantConversation, body.conversation_id)
        if not c or c.user_id != user.id:
            raise HTTPException(404, "Conversation not found.")
    else:
        c = AssistantConversation(user_id=user.id, title=body.message[:60])
        db.add(c)
        db.flush()
    if c.title == "New conversation":
        c.title = body.message[:60]
    history = db.scalars(select(AssistantMessage).where(AssistantMessage.conversation_id == c.id)
                         .order_by(AssistantMessage.created_at.desc()).limit(20)).all()[::-1]
    db.add(AssistantMessage(conversation_id=c.id, role="user", content=body.message))
    ctx = build_context(db, user)
    reply = None
    if user.ai_consent:
        reply = provider.chat("assistant", "User career data (JSON):\n" + json.dumps(ctx, default=str),
                              [{"role": m.role, "content": m.content} for m in history] + [{"role": "user", "content": body.message}],
                              user_id=user.id)
    method = "ai" if reply else "rules"
    reply = reply or rule_based_reply(body.message, ctx)
    m = AssistantMessage(conversation_id=c.id, role="assistant", content=reply, meta={"method": method})
    db.add(m)
    c.updated_at = utcnow()
    entitlements.consume(db, user, "assistant_messages")
    db.commit()
    return {"conversation_id": str(c.id), "message": {"id": str(m.id), "role": "assistant", "content": reply,
                                                       "created_at": m.created_at}, "method": method}


@router.delete("/assistant/conversations/{cid}")
def delete_conversation(cid: uuid.UUID, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    c = db.get(AssistantConversation, cid)
    if not c or c.user_id != user.id:
        raise HTTPException(404, "Conversation not found.")
    db.delete(c)
    db.commit()
    return {"ok": True}
