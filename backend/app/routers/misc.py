"""Dashboard, notifications, protected files."""
import uuid
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .. import entitlements
from ..db import get_db
from ..models import (ApplicationInterview, JobApplication, Notification, Reminder, Resume, ResumeAnalysis,
                      SalaryAssessment, User, utcnow)
from ..security import check_file_signature, get_current_user
from ..storage import read_file
from .applications import LABELS, reminder_out
from .profile import profile_out
from .salary_assistant import matching_jobs, _profile
from .jobs import job_out

router = APIRouter(tags=["dashboard"])


@router.get("/dashboard")
def dashboard(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    now = utcnow()
    prof = profile_out(db, user)
    apps = db.scalars(select(JobApplication).where(JobApplication.user_id == user.id)).all()
    by = {}
    for a in apps:
        by[a.status] = by.get(a.status, 0) + 1
    interviews = db.execute(select(ApplicationInterview, JobApplication).join(JobApplication, JobApplication.id == ApplicationInterview.application_id)
                            .where(JobApplication.user_id == user.id, ApplicationInterview.scheduled_at >= now,
                                   ApplicationInterview.status == "scheduled").order_by(ApplicationInterview.scheduled_at).limit(5)).all()
    reminders = db.scalars(select(Reminder).where(Reminder.user_id == user.id, Reminder.done_at.is_(None))
                           .order_by(Reminder.due_at).limit(6)).all()
    resumes = db.scalars(select(Resume).where(Resume.user_id == user.id).order_by(Resume.updated_at.desc())).all()
    best = None
    if resumes:
        best = db.scalar(select(ResumeAnalysis).where(ResumeAnalysis.resume_id.in_([r.id for r in resumes]))
                         .order_by(ResumeAnalysis.created_at.desc()))
    sal = db.scalar(select(SalaryAssessment).where(SalaryAssessment.user_id == user.id).order_by(SalaryAssessment.created_at.desc()))
    notes = db.scalars(select(Notification).where(Notification.user_id == user.id).order_by(Notification.created_at.desc()).limit(6)).all()

    recs = []  # grounded in the user's own data only
    if prof["completeness"] < 70:
        recs.append({"type": "profile", "title": "Complete your career profile",
                     "body": f"Your profile is {prof['completeness']}% complete. Recommendations get sharper with your title, experience and skills.", "link": "/app/profile"})
    if not resumes:
        recs.append({"type": "resume", "title": "Upload your resume", "body": "We'll parse it, check it against ATS rules and tailor it to jobs.", "link": "/app/resumes"})
    elif best and best.score is not None and best.score < 70:
        miss = (best.result.get("keywords") or {}).get("missing_required", [])[:5]
        recs.append({"type": "resume", "title": f"Raise your resume score ({best.score}/100)",
                     "body": ("Missing requirements from your last analysis: " + ", ".join(miss)) if miss else "Apply the recommendations from your last analysis.", "link": "/app/resumes"})
    stale = [a for a in apps if a.status in ("applied", "viewed") and (now - (a.updated_at if a.updated_at.tzinfo else a.updated_at.replace(tzinfo=now.tzinfo))).days >= 7]
    if stale:
        recs.append({"type": "follow_up", "title": f"Follow up on {len(stale)} application{'s' if len(stale) > 1 else ''}",
                     "body": ", ".join(a.company_name for a in stale[:3]) + " haven't moved in a week.", "link": "/app/tracker"})
    if interviews:
        i, a = interviews[0]
        recs.append({"type": "interview", "title": f"Prepare for {a.company_name}",
                     "body": f"{i.title} on {i.scheduled_at:%b %d}. Ask the assistant for likely questions.", "link": "/app/assistant"})
    if not sal and (prof.get("current_title") or prof.get("target_title")):
        recs.append({"type": "salary", "title": "See what you could earn", "body": "Get a salary estimate from live job postings with disclosed pay.", "link": "/app/salary"})
    elif sal and prof.get("salary_min") and sal.mid and sal.mid < prof["salary_min"]:
        recs.append({"type": "salary", "title": "Your target is above the market midpoint",
                     "body": f"Estimated midpoint ${sal.mid:,.0f} vs your target ${prof['salary_min']:,.0f}. See the growth plan.", "link": "/app/salary"})
    jobs = matching_jobs(db, _profile(db, user), 4)
    return {
        "profile": {"full_name": prof["full_name"], "title": prof.get("current_title"), "target_title": prof.get("target_title"),
                    "completeness": prof["completeness"], "profile_type": prof.get("profile_type")},
        "applications": {"total": len(apps), "active": sum(n for s, n in by.items() if s in ("applied", "viewed", "screening", "interview", "assessment", "final_interview")),
                         "offers": by.get("offer", 0) + by.get("hired", 0),
                         "by_status": [{"status": s, "label": LABELS.get(s, s), "count": n} for s, n in by.items()]},
        "upcoming_interviews": [{"id": str(i.id), "application_id": str(a.id), "company": a.company_name, "title": i.title,
                                 "scheduled_at": i.scheduled_at, "type": i.type, "meeting_url": i.meeting_url} for i, a in interviews],
        "reminders": [reminder_out(r) for r in reminders],
        "resume": {"count": len(resumes), "last_score": best.score if best else None,
                   "latest": {"id": str(resumes[0].id), "title": resumes[0].title} if resumes else None},
        "salary": {"low": sal.low, "mid": sal.mid, "high": sal.high, "title": sal.occupation, "confidence": sal.confidence} if sal else None,
        "recommendations": recs[:5],
        "matching_jobs": [job_out(j) for j in jobs],
        "notifications": [{"id": str(n.id), "title": n.title, "body": n.body, "link": n.link, "read": n.read_at is not None,
                           "created_at": n.created_at} for n in notes],
        "usage": entitlements.snapshot(db, user),
    }


@router.get("/notifications")
def notifications(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    ns = db.scalars(select(Notification).where(Notification.user_id == user.id).order_by(Notification.created_at.desc()).limit(40)).all()
    unread = db.scalar(select(func.count(Notification.id)).where(Notification.user_id == user.id, Notification.read_at.is_(None)))
    # due reminders surface as notifications
    due = db.scalars(select(Reminder).where(Reminder.user_id == user.id, Reminder.done_at.is_(None),
                                            Reminder.due_at <= utcnow() + timedelta(hours=24))).all()
    return {"unread": (unread or 0) + len(due),
            "due_reminders": [reminder_out(r) for r in due],
            "items": [{"id": str(n.id), "type": n.type, "title": n.title, "body": n.body, "link": n.link,
                       "read": n.read_at is not None, "created_at": n.created_at} for n in ns]}


@router.post("/notifications/read")
def mark_read(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    now = utcnow()
    for n in db.scalars(select(Notification).where(Notification.user_id == user.id, Notification.read_at.is_(None))):
        n.read_at = now
    db.commit()
    return {"ok": True}


@router.get("/files/{kind}/{obj_id}")
def file(kind: str, obj_id: uuid.UUID, u: uuid.UUID, e: int, s: str, db: Session = Depends(get_db)):
    if not check_file_signature(kind, obj_id, u, e, s):
        raise HTTPException(403, "This link has expired. Reload the page.")
    if kind != "resume":
        raise HTTPException(404, "File not found.")
    r = db.get(Resume, obj_id)
    if not r or r.user_id != u or not r.original_file_path:
        raise HTTPException(404, "File not found.")
    ext = r.original_file_path.rsplit(".", 1)[-1]
    mt = "application/pdf" if ext == "pdf" else "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    return Response(read_file(r.original_file_path), media_type=mt,
                    headers={"Content-Disposition": f'inline; filename="{r.original_filename}"', "Cache-Control": "private, max-age=300"})
