"""Job Tracker: applications, pipeline, interviews, reminders, statistics."""
import uuid
from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .. import entitlements
from ..db import get_db
from ..models import (ApplicationEvent, ApplicationInterview, Job, JobApplication, Reminder, Resume, ResumeVersion, User,
                      utcnow)
from ..security import get_current_user
from ..services import audit

router = APIRouter(tags=["applications"])

PIPELINE = ["interested", "preparing", "applied", "viewed", "screening", "interview", "assessment", "final_interview",
            "offer", "hired", "rejected", "withdrawn", "archived"]
LABELS = {"interested": "Interested", "preparing": "Preparing Application", "applied": "Applied",
          "viewed": "Application Viewed", "screening": "Recruiter Screening", "interview": "Interview",
          "assessment": "Assessment", "final_interview": "Final Interview", "offer": "Offer Received", "hired": "Hired",
          "rejected": "Rejected", "withdrawn": "Withdrawn", "archived": "Archived"}
ACTIVE = {"applied", "viewed", "screening", "interview", "assessment", "final_interview"}


def _aware(d: datetime | None) -> datetime | None:
    return d.replace(tzinfo=timezone.utc) if d is not None and d.tzinfo is None else d


class AppIn(BaseModel):
    job_id: uuid.UUID | None = None
    company_name: str | None = Field(None, max_length=200)
    company_website: str | None = Field(None, max_length=300)
    job_title: str | None = Field(None, max_length=200)
    job_url: str | None = Field(None, max_length=500)
    description: str | None = Field(None, max_length=30000)
    location: str | None = Field(None, max_length=160)
    employment_type: str | None = Field(None, max_length=30)
    work_arrangement: str | None = Field(None, max_length=20)
    salary_min: float | None = Field(None, ge=0)
    salary_max: float | None = Field(None, ge=0)
    currency: str | None = Field(None, max_length=3)
    applied_at: date | None = None
    resume_version_id: uuid.UUID | None = None
    cover_letter: str | None = Field(None, max_length=10000)
    recruiter_name: str | None = Field(None, max_length=120)
    recruiter_email: str | None = Field(None, max_length=200)
    notes: str | None = Field(None, max_length=10000)
    status: str | None = Field(None, min_length=2, max_length=40)

    @field_validator("status")
    @classmethod
    def _st(cls, v):
        return v.strip().lower().replace(" ", "_") if v else v


def _own(db: Session, user: User, aid: uuid.UUID) -> JobApplication:
    a = db.get(JobApplication, aid)
    if not a or a.user_id != user.id:
        raise HTTPException(404, "Application not found.")
    return a


def _check_version(db: Session, user: User, vid: uuid.UUID | None) -> None:
    if not vid:
        return
    v = db.get(ResumeVersion, vid)
    r = db.get(Resume, v.resume_id) if v else None
    if not r or r.user_id != user.id:
        raise HTTPException(404, "Resume version not found.")


def app_out(db: Session, a: JobApplication, detail: bool = False) -> dict:
    d = {c.name: getattr(a, c.name) for c in JobApplication.__table__.columns}
    for k in ("id", "user_id", "job_id", "resume_version_id"):
        d[k] = str(d[k]) if d[k] else None
    d["status_label"] = LABELS.get(a.status, a.status.replace("_", " ").title())
    now = utcnow()
    nxt = db.scalar(select(ApplicationInterview).where(ApplicationInterview.application_id == a.id,
                                                       ApplicationInterview.scheduled_at >= now,
                                                       ApplicationInterview.status == "scheduled")
                    .order_by(ApplicationInterview.scheduled_at))
    d["next_interview"] = nxt.scheduled_at if nxt else None
    if a.resume_version_id:
        v = db.get(ResumeVersion, a.resume_version_id)
        d["resume_version_name"] = v.name if v else None
    if detail:
        d["interviews"] = [interview_out(i) for i in db.scalars(select(ApplicationInterview).where(
            ApplicationInterview.application_id == a.id).order_by(ApplicationInterview.scheduled_at))]
        d["events"] = [{"type": e.type, "from": e.from_status, "to": e.to_status, "note": e.note, "created_at": e.created_at}
                       for e in db.scalars(select(ApplicationEvent).where(ApplicationEvent.application_id == a.id)
                                           .order_by(ApplicationEvent.created_at))]
        d["reminders"] = [reminder_out(r) for r in db.scalars(select(Reminder).where(Reminder.application_id == a.id)
                                                              .order_by(Reminder.due_at))]
    return d


def interview_out(i: ApplicationInterview) -> dict:
    d = {c.name: getattr(i, c.name) for c in ApplicationInterview.__table__.columns}
    d["id"], d["application_id"] = str(i.id), str(i.application_id)
    return d


def reminder_out(r: Reminder) -> dict:
    return {"id": str(r.id), "application_id": str(r.application_id) if r.application_id else None, "type": r.type,
            "title": r.title, "due_at": r.due_at, "done": r.done_at is not None}


@router.get("/applications/pipeline")
def pipeline():
    return [{"key": k, "label": LABELS[k]} for k in PIPELINE]


@router.get("/applications")
def list_apps(status: str | None = None, q: str | None = None, location: str | None = None,
              employment_type: str | None = None, sort: str = "updated",
              user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    stmt = select(JobApplication).where(JobApplication.user_id == user.id)
    if status:
        stmt = stmt.where(JobApplication.status.in_(status.split(",")))
    if q:
        like = f"%{q}%"
        stmt = stmt.where((JobApplication.company_name.ilike(like)) | (JobApplication.job_title.ilike(like)))
    if location:
        stmt = stmt.where(JobApplication.location.ilike(f"%{location}%"))
    if employment_type:
        stmt = stmt.where(JobApplication.employment_type == employment_type)
    order = {"applied": JobApplication.applied_at.desc().nullslast(), "company": JobApplication.company_name,
             "salary": JobApplication.salary_max.desc().nullslast()}.get(sort, JobApplication.updated_at.desc())
    return [app_out(db, a) for a in db.scalars(stmt.order_by(order)).all()]


@router.post("/applications", status_code=201)
def create_app(body: AppIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    entitlements.check(db, user, "applications")
    data = body.model_dump(exclude_unset=True)
    if body.job_id:
        j = db.get(Job, body.job_id)
        if not j:
            raise HTTPException(404, "Job not found.")
        if db.scalar(select(JobApplication).where(JobApplication.user_id == user.id, JobApplication.job_id == j.id)):
            raise HTTPException(409, "You're already tracking this job.")
        prefill = {"company_name": j.company or j.source_name, "job_title": j.title, "job_url": j.url,
                   "description": j.description, "location": j.location, "employment_type": j.employment_type,
                   "work_arrangement": j.work_format, "salary_min": j.salary_min, "salary_max": j.salary_max,
                   "currency": j.currency}
        data = {**{k: v for k, v in prefill.items() if v is not None}, **data}
    if not data.get("company_name") or not data.get("job_title"):
        raise HTTPException(422, "Add the company name and job title.")
    _check_version(db, user, body.resume_version_id)
    data.setdefault("status", "interested")
    if data["status"] in ("applied",) and not data.get("applied_at"):
        data["applied_at"] = date.today()
    a = JobApplication(user_id=user.id, **data)
    db.add(a)
    db.flush()
    db.add(ApplicationEvent(application_id=a.id, type="created", to_status=a.status))
    audit(db, user.id, "application.created", "application", a.id)
    db.commit()
    return app_out(db, a, detail=True)


@router.get("/applications/statistics")
def stats(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.execute(select(JobApplication.status, func.count()).where(JobApplication.user_id == user.id)
                      .group_by(JobApplication.status)).all()
    by = {s: n for s, n in rows}
    total = sum(by.values())
    applied_plus = sum(n for s, n in by.items() if s not in ("interested", "preparing"))
    responded = sum(n for s, n in by.items() if s in ("viewed", "screening", "interview", "assessment", "final_interview", "offer", "hired", "rejected"))
    interviews = sum(n for s, n in by.items() if s in ("interview", "assessment", "final_interview", "offer", "hired"))
    now = utcnow()
    week = db.scalar(select(func.count(JobApplication.id)).where(JobApplication.user_id == user.id,
                                                                 JobApplication.applied_at >= (now - timedelta(days=7)).date())) or 0
    stale = db.scalars(select(JobApplication).where(JobApplication.user_id == user.id, JobApplication.status.in_(["applied", "viewed"]),
                                                    JobApplication.updated_at < now - timedelta(days=10))).all()
    upcoming = db.scalar(select(func.count(ApplicationInterview.id)).join(JobApplication, JobApplication.id == ApplicationInterview.application_id)
                         .where(JobApplication.user_id == user.id, ApplicationInterview.scheduled_at >= now,
                                ApplicationInterview.status == "scheduled")) or 0
    return {"total": total, "by_status": [{"status": s, "label": LABELS.get(s, s), "count": by.get(s, 0)} for s in PIPELINE if by.get(s)],
            "active": sum(n for s, n in by.items() if s in ACTIVE), "applied_this_week": week,
            "response_rate": round(100 * responded / applied_plus) if applied_plus else 0,
            "interview_rate": round(100 * interviews / applied_plus) if applied_plus else 0,
            "offers": by.get("offer", 0) + by.get("hired", 0), "upcoming_interviews": upcoming,
            "awaiting_response": [{"id": str(a.id), "company": a.company_name, "title": a.job_title,
                                   "days": (now - _aware(a.updated_at)).days} for a in stale[:10]]}


@router.get("/applications/{aid}")
def get_app(aid: uuid.UUID, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return app_out(db, _own(db, user, aid), detail=True)


@router.patch("/applications/{aid}")
def update_app(aid: uuid.UUID, body: AppIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    a = _own(db, user, aid)
    data = body.model_dump(exclude_unset=True)
    data.pop("job_id", None)
    _check_version(db, user, data.get("resume_version_id"))
    prev = a.status
    for k, v in data.items():
        setattr(a, k, v)
    if "status" in data and data["status"] != prev:
        db.add(ApplicationEvent(application_id=a.id, type="status_changed", from_status=prev, to_status=a.status))
        if a.status == "applied" and not a.applied_at:
            a.applied_at = date.today()
            db.add(Reminder(user_id=user.id, application_id=a.id, type="follow_up",
                            title=f"Follow up with {a.company_name}", due_at=utcnow() + timedelta(days=7)))
    if "resume_version_id" in data and data["resume_version_id"]:
        v = db.get(ResumeVersion, data["resume_version_id"])
        v.linked_application_id = a.id
    db.commit()
    return app_out(db, a, detail=True)


@router.delete("/applications/{aid}")
def delete_app(aid: uuid.UUID, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    a = _own(db, user, aid)
    db.delete(a)
    audit(db, user.id, "application.deleted", "application", aid)
    db.commit()
    return {"ok": True}


class InterviewIn(BaseModel):
    title: str = Field(min_length=2, max_length=160)
    type: str = Field("video", max_length=40)
    scheduled_at: datetime
    timezone: str | None = Field(None, max_length=60)
    duration_min: int = Field(60, ge=5, le=600)
    interviewer: str | None = Field(None, max_length=160)
    platform: str | None = Field(None, max_length=60)
    meeting_url: str | None = Field(None, max_length=500)
    location: str | None = Field(None, max_length=200)
    notes: str | None = Field(None, max_length=5000)
    feedback: str | None = Field(None, max_length=5000)
    status: str = Field("scheduled", max_length=20)


@router.post("/applications/{aid}/interviews", status_code=201)
def add_interview(aid: uuid.UUID, body: InterviewIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    a = _own(db, user, aid)
    i = ApplicationInterview(application_id=a.id, **body.model_dump())
    i.scheduled_at = _aware(i.scheduled_at)
    db.add(i)
    if a.status in ("interested", "preparing", "applied", "viewed", "screening"):
        db.add(ApplicationEvent(application_id=a.id, type="status_changed", from_status=a.status, to_status="interview"))
        a.status = "interview"
    db.add(Reminder(user_id=user.id, application_id=a.id, type="interview", title=f"{body.title} — {a.company_name}",
                    due_at=i.scheduled_at - timedelta(hours=24)))
    db.add(ApplicationEvent(application_id=a.id, type="interview_scheduled", note=body.title))
    db.commit()
    return interview_out(i)


@router.patch("/interviews/{iid}")
def update_interview(iid: uuid.UUID, body: InterviewIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    i = db.get(ApplicationInterview, iid)
    if not i:
        raise HTTPException(404, "Interview not found.")
    _own(db, user, i.application_id)
    for k, v in body.model_dump().items():
        setattr(i, k, v)
    db.commit()
    return interview_out(i)


@router.delete("/interviews/{iid}")
def delete_interview(iid: uuid.UUID, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    i = db.get(ApplicationInterview, iid)
    if not i:
        raise HTTPException(404, "Interview not found.")
    _own(db, user, i.application_id)
    db.delete(i)
    db.commit()
    return {"ok": True}


class ReminderIn(BaseModel):
    title: str = Field(min_length=2, max_length=200)
    type: str = Field("custom", max_length=30)
    due_at: datetime


@router.post("/applications/{aid}/reminders", status_code=201)
def add_reminder(aid: uuid.UUID, body: ReminderIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    a = _own(db, user, aid)
    r = Reminder(user_id=user.id, application_id=a.id, title=body.title, type=body.type, due_at=_aware(body.due_at))
    db.add(r)
    db.commit()
    return reminder_out(r)


@router.post("/reminders", status_code=201)
def add_free_reminder(body: ReminderIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    r = Reminder(user_id=user.id, title=body.title, type=body.type, due_at=_aware(body.due_at))
    db.add(r)
    db.commit()
    return reminder_out(r)


@router.get("/reminders")
def list_reminders(include_done: bool = False, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    stmt = select(Reminder).where(Reminder.user_id == user.id)
    if not include_done:
        stmt = stmt.where(Reminder.done_at.is_(None))
    return [reminder_out(r) for r in db.scalars(stmt.order_by(Reminder.due_at).limit(200))]


@router.patch("/reminders/{rid}")
def toggle_reminder(rid: uuid.UUID, done: bool = Query(True), user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    r = db.get(Reminder, rid)
    if not r or r.user_id != user.id:
        raise HTTPException(404, "Reminder not found.")
    r.done_at = utcnow() if done else None
    db.commit()
    return reminder_out(r)
