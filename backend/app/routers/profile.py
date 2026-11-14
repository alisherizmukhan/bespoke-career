"""Career profile, onboarding, skills, data export and account deletion."""
import uuid
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import (ApplicationInterview, AssistantConversation, AssistantMessage, JobApplication, Reminder, Resume,
                      ResumeVersion, SalaryAssessment, User, UserProfile, UserSkill, utcnow)
from ..security import get_current_user, verify_password
from ..services import audit
from ..storage import delete_file

router = APIRouter(tags=["profile"])

PROFILE_TYPES = ("professional", "student", "high_school", "recent_graduate", "career_changer")


class ProfileIn(BaseModel):
    full_name: str | None = Field(None, min_length=2, max_length=120)
    profile_type: Literal["professional", "student", "high_school", "recent_graduate", "career_changer"] | None = None
    country: str | None = Field(None, max_length=80)
    city: str | None = Field(None, max_length=80)
    employment_status: str | None = Field(None, max_length=40)
    industry: str | None = Field(None, max_length=80)
    occupation: str | None = Field(None, max_length=120)
    current_title: str | None = Field(None, max_length=120)
    years_experience: float | None = Field(None, ge=0, le=60)
    seniority: Literal["intern", "entry", "mid", "senior", "lead", "executive"] | None = None
    education: list[dict] | None = None
    career_goals: str | None = Field(None, max_length=3000)
    target_title: str | None = Field(None, max_length=120)
    employment_types: list[str] | None = None
    work_formats: list[str] | None = None
    salary_min: float | None = Field(None, ge=0, le=5_000_000)
    salary_max: float | None = Field(None, ge=0, le=5_000_000)
    currency: str | None = Field(None, min_length=3, max_length=3)
    linkedin_url: str | None = Field(None, max_length=300)
    portfolio_url: str | None = Field(None, max_length=300)
    certifications: list[str] | None = None
    achievements: list[str] | None = None
    previous_employers: list | None = None
    skills: list[str] | None = None
    onboarding_completed: bool | None = None


def _profile(db: Session, user: User) -> UserProfile:
    p = db.scalar(select(UserProfile).where(UserProfile.user_id == user.id))
    if not p:
        p = UserProfile(user_id=user.id, full_name=user.email.split("@")[0])
        db.add(p)
        db.flush()
    return p


def profile_out(db: Session, user: User) -> dict:
    p = _profile(db, user)
    skills = db.scalars(select(UserSkill).where(UserSkill.user_id == user.id).order_by(UserSkill.created_at)).all()
    fields = ["full_name", "profile_type", "country", "city", "employment_status", "industry", "occupation", "current_title",
              "years_experience", "seniority", "education", "career_goals", "target_title", "employment_types",
              "work_formats", "salary_min", "salary_max", "currency", "linkedin_url", "portfolio_url", "certifications",
              "achievements", "previous_employers", "onboarding_completed"]
    d = {f: getattr(p, f) for f in fields}
    d["skills"] = [{"id": str(s.id), "skill": s.skill, "category": s.category, "proficiency": s.proficiency,
                    "verified": s.verified} for s in skills]
    checks = [p.full_name, p.city, p.current_title or p.target_title, p.years_experience is not None, p.industry,
              p.education, skills, p.career_goals, p.target_title, p.salary_min]
    d["completeness"] = round(100 * sum(1 for c in checks if c) / len(checks))
    d["email"] = user.email
    return d


@router.get("/profile")
def get_profile(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    d = profile_out(db, user)
    db.commit()
    return d


@router.patch("/profile")
def update_profile(body: ProfileIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    p = _profile(db, user)
    data = body.model_dump(exclude_unset=True)
    skills = data.pop("skills", None)
    if data.get("salary_min") and data.get("salary_max") and data["salary_min"] > data["salary_max"]:
        raise HTTPException(422, "Minimum salary can't be higher than the maximum.")
    for k, v in data.items():
        if isinstance(v, list):
            v = [x.strip() if isinstance(x, str) else x for x in v if x not in ("", None)][:40]
        setattr(p, k, v.upper() if k == "currency" and v else v)
    if skills is not None:
        existing = {s.skill.lower(): s for s in db.scalars(select(UserSkill).where(UserSkill.user_id == user.id))}
        wanted = []
        for s in skills:
            s = s.strip()[:80]
            if s and s.lower() not in [w.lower() for w in wanted]:
                wanted.append(s)
        for key, s in existing.items():
            if key not in [w.lower() for w in wanted]:
                db.delete(s)
        for w in wanted:
            if w.lower() not in existing:
                db.add(UserSkill(user_id=user.id, skill=w, verified=True))
    audit(db, user.id, "profile.updated", "profile", p.id, fields=list(data))
    db.commit()
    return profile_out(db, user)


class SkillIn(BaseModel):
    skill: str = Field(min_length=1, max_length=80)
    category: Literal["hard", "soft", "tool", "language"] = "hard"
    proficiency: int | None = Field(None, ge=1, le=5)


@router.get("/profile/skills")
def list_skills(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return profile_out(db, user)["skills"]


@router.post("/profile/skills", status_code=201)
def add_skill(body: SkillIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if db.scalar(select(UserSkill).where(UserSkill.user_id == user.id, UserSkill.skill.ilike(body.skill.strip()))):
        raise HTTPException(409, "You already have this skill.")
    s = UserSkill(user_id=user.id, skill=body.skill.strip(), category=body.category, proficiency=body.proficiency, verified=True)
    db.add(s)
    db.commit()
    return {"id": str(s.id), "skill": s.skill, "category": s.category, "proficiency": s.proficiency}


@router.delete("/profile/skills/{sid}")
def delete_skill(sid: uuid.UUID, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    s = db.get(UserSkill, sid)
    if not s or s.user_id != user.id:
        raise HTTPException(404, "Skill not found.")
    db.delete(s)
    db.commit()
    return {"ok": True}


# ---------------------------------------------------------------- user rights (view / export / delete)


@router.get("/account/export")
def export_data(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    def rows(model, *where):
        return [{c.name: (str(v) if isinstance(v := getattr(r, c.name), uuid.UUID) else v)
                 for c in model.__table__.columns if c.name not in ("password_hash",)}
                for r in db.scalars(select(model).where(*where))]
    resumes = db.scalars(select(Resume).where(Resume.user_id == user.id)).all()
    apps = db.scalars(select(JobApplication).where(JobApplication.user_id == user.id)).all()
    convs = db.scalars(select(AssistantConversation).where(AssistantConversation.user_id == user.id)).all()
    audit(db, user.id, "account.exported", "user", user.id)
    db.commit()
    return {
        "account": {"email": user.email, "created_at": user.created_at},
        "profile": profile_out(db, user),
        "resumes": rows(Resume, Resume.user_id == user.id),
        "resume_versions": rows(ResumeVersion, ResumeVersion.resume_id.in_([r.id for r in resumes] or [uuid.uuid4()])),
        "applications": rows(JobApplication, JobApplication.user_id == user.id),
        "interviews": rows(ApplicationInterview, ApplicationInterview.application_id.in_([a.id for a in apps] or [uuid.uuid4()])),
        "reminders": rows(Reminder, Reminder.user_id == user.id),
        "salary_assessments": rows(SalaryAssessment, SalaryAssessment.user_id == user.id),
        "assistant_messages": rows(AssistantMessage, AssistantMessage.conversation_id.in_([c.id for c in convs] or [uuid.uuid4()])),
    }


class PrefsIn(BaseModel):
    ai_consent: bool


@router.get("/account/preferences")
def get_prefs(user: User = Depends(get_current_user)):
    return {"ai_consent": user.ai_consent}


@router.patch("/account/preferences")
def set_prefs(body: PrefsIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    user.ai_consent = body.ai_consent
    audit(db, user.id, "account.ai_consent", "user", user.id, value=body.ai_consent)
    db.commit()
    return {"ai_consent": user.ai_consent}


class DeleteIn(BaseModel):
    password: str


@router.post("/account/delete")
def delete_account(body: DeleteIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if user.role == "admin":
        raise HTTPException(409, "Admin accounts can't be deleted from here.")
    if not verify_password(body.password, user.password_hash):
        raise HTTPException(400, "Password is incorrect.")
    for r in db.scalars(select(Resume).where(Resume.user_id == user.id)):
        if r.original_file_path:
            delete_file(r.original_file_path)
    uid = user.id
    audit(db, uid, "account.deleted", "user", uid)
    db.flush()
    # Child rows cascade through foreign keys; the user row is anonymized so audit history stays intact.
    for model in (Resume, JobApplication, Reminder, SalaryAssessment, AssistantConversation, UserSkill, UserProfile):
        db.execute(delete(model).where(model.user_id == uid))
    user.email = f"deleted-{uid}@deleted.invalid"
    user.password_hash = None
    user.account_status = "deleted"
    db.commit()
    return {"ok": True}
