"""Database models (UUID primary keys, UTC timestamps)."""
import uuid
from datetime import date, datetime, timezone

from sqlalchemy import (
    JSON,
    Boolean,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    Uuid,
)
from sqlalchemy.orm import Mapped, mapped_column

from .db import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


TS = DateTime(timezone=True)


def pk():
    return mapped_column(Uuid, primary_key=True, default=uuid.uuid4)


def fk(target: str, nullable: bool = False, ondelete: str = "CASCADE", index: bool = True):
    return mapped_column(Uuid, ForeignKey(target, ondelete=ondelete), nullable=nullable, index=index)


class Timestamps:
    created_at: Mapped[datetime] = mapped_column(TS, default=utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(TS, default=utcnow, onupdate=utcnow, nullable=False)


# ============================================================ identity


class User(Timestamps, Base):
    __tablename__ = "users"
    id: Mapped[uuid.UUID] = pk()
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    password_hash: Mapped[str | None] = mapped_column(String(255))
    auth_provider: Mapped[str] = mapped_column(String(20), default="password")
    role: Mapped[str] = mapped_column(String(20), default="user")  # user | admin
    account_status: Mapped[str] = mapped_column(String(20), default="active")  # active | suspended | deleted
    email_verified_at: Mapped[datetime | None] = mapped_column(TS)
    last_login_at: Mapped[datetime | None] = mapped_column(TS)
    ai_consent: Mapped[bool] = mapped_column(Boolean, default=True)


class EmailToken(Base):
    __tablename__ = "email_tokens"
    id: Mapped[uuid.UUID] = pk()
    user_id: Mapped[uuid.UUID] = fk("users.id")
    kind: Mapped[str] = mapped_column(String(20))
    token_hash: Mapped[str] = mapped_column(String(128), unique=True)
    expires_at: Mapped[datetime] = mapped_column(TS)
    used_at: Mapped[datetime | None] = mapped_column(TS)
    created_at: Mapped[datetime] = mapped_column(TS, default=utcnow)


class UserProfile(Timestamps, Base):
    __tablename__ = "user_profiles"
    id: Mapped[uuid.UUID] = pk()
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id", ondelete="CASCADE"), unique=True)
    profile_type: Mapped[str] = mapped_column(String(30), default="professional")
    full_name: Mapped[str] = mapped_column(String(120))
    country: Mapped[str | None] = mapped_column(String(80))
    city: Mapped[str | None] = mapped_column(String(80))
    employment_status: Mapped[str | None] = mapped_column(String(40))
    industry: Mapped[str | None] = mapped_column(String(80))
    occupation: Mapped[str | None] = mapped_column(String(120))
    current_title: Mapped[str | None] = mapped_column(String(120))
    years_experience: Mapped[float | None] = mapped_column(Float)
    seniority: Mapped[str | None] = mapped_column(String(30))
    education: Mapped[list] = mapped_column(JSON, default=list)
    career_goals: Mapped[str | None] = mapped_column(Text)
    target_title: Mapped[str | None] = mapped_column(String(120))
    employment_types: Mapped[list] = mapped_column(JSON, default=list)
    work_formats: Mapped[list] = mapped_column(JSON, default=list)
    salary_min: Mapped[float | None] = mapped_column(Float)
    salary_max: Mapped[float | None] = mapped_column(Float)
    currency: Mapped[str] = mapped_column(String(3), default="KZT")
    linkedin_url: Mapped[str | None] = mapped_column(String(300))
    portfolio_url: Mapped[str | None] = mapped_column(String(300))
    certifications: Mapped[list] = mapped_column(JSON, default=list)
    achievements: Mapped[list] = mapped_column(JSON, default=list)
    previous_employers: Mapped[list] = mapped_column(JSON, default=list)
    onboarding_completed: Mapped[bool] = mapped_column(Boolean, default=False)


class UserSkill(Base):
    __tablename__ = "user_skills"
    id: Mapped[uuid.UUID] = pk()
    user_id: Mapped[uuid.UUID] = fk("users.id")
    skill: Mapped[str] = mapped_column(String(80))
    category: Mapped[str] = mapped_column(String(20), default="hard")  # hard | soft | tool | language
    proficiency: Mapped[int | None] = mapped_column(Integer)  # 1..5
    verified: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(TS, default=utcnow)
    __table_args__ = (UniqueConstraint("user_id", "skill"),)


# ============================================================ knowledge


class Industry(Base):
    __tablename__ = "industries"
    id: Mapped[uuid.UUID] = pk()
    slug: Mapped[str] = mapped_column(String(60), unique=True)
    name: Mapped[str] = mapped_column(String(120))
    sort: Mapped[int] = mapped_column(Integer, default=0)


class Occupation(Base):
    __tablename__ = "occupations"
    id: Mapped[uuid.UUID] = pk()
    industry_id: Mapped[uuid.UUID] = fk("industries.id")
    title: Mapped[str] = mapped_column(String(120))
    soc_code: Mapped[str | None] = mapped_column(String(10))
    keywords: Mapped[list] = mapped_column(JSON, default=list)
    recommended_documents: Mapped[list] = mapped_column(JSON, default=list)


class DocumentType(Base):
    __tablename__ = "document_types"
    id: Mapped[uuid.UUID] = pk()
    slug: Mapped[str] = mapped_column(String(60), unique=True)
    name: Mapped[str] = mapped_column(String(120))
    description: Mapped[str] = mapped_column(Text)
    sections: Mapped[list] = mapped_column(JSON, default=list)
    max_pages: Mapped[int] = mapped_column(Integer, default=2)


class ResumeGuideline(Timestamps, Base):
    __tablename__ = "resume_guidelines"
    id: Mapped[uuid.UUID] = pk()
    industry_slug: Mapped[str | None] = mapped_column(String(60), index=True)
    occupation: Mapped[str | None] = mapped_column(String(120))
    document_type: Mapped[str | None] = mapped_column(String(60))
    country: Mapped[str | None] = mapped_column(String(40))
    category: Mapped[str] = mapped_column(String(30))
    # legal | employer | association | convention | best_practice
    text: Mapped[str] = mapped_column(Text)
    source_url: Mapped[str | None] = mapped_column(String(400))
    source_type: Mapped[str | None] = mapped_column(String(40))
    confidence: Mapped[str] = mapped_column(String(10), default="medium")
    is_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    last_verified: Mapped[date | None] = mapped_column(Date)
    version: Mapped[int] = mapped_column(Integer, default=1)


# ============================================================ resumes


class Resume(Timestamps, Base):
    __tablename__ = "resumes"
    id: Mapped[uuid.UUID] = pk()
    user_id: Mapped[uuid.UUID] = fk("users.id")
    title: Mapped[str] = mapped_column(String(160))
    document_type: Mapped[str] = mapped_column(String(60), default="professional")
    original_file_path: Mapped[str | None] = mapped_column(String(500))
    original_filename: Mapped[str | None] = mapped_column(String(255))
    raw_text: Mapped[str | None] = mapped_column(Text)
    parsed_content: Mapped[dict] = mapped_column(JSON, default=dict)
    status: Mapped[str] = mapped_column(String(20), default="draft")  # uploaded|parsed|verified|draft


class ResumeVersion(Base):
    __tablename__ = "resume_versions"
    id: Mapped[uuid.UUID] = pk()
    resume_id: Mapped[uuid.UUID] = fk("resumes.id")
    version: Mapped[int] = mapped_column(Integer)
    name: Mapped[str] = mapped_column(String(160))
    content: Mapped[dict] = mapped_column(JSON)
    template: Mapped[str] = mapped_column(String(40), default="classic")
    source: Mapped[str] = mapped_column(String(20), default="generated")  # generated|edited|adapted|restored
    job_description: Mapped[str | None] = mapped_column(Text)
    linked_application_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True)
    created_at: Mapped[datetime] = mapped_column(TS, default=utcnow)
    __table_args__ = (UniqueConstraint("resume_id", "version"),)


class ResumeAnalysis(Base):
    __tablename__ = "resume_analyses"
    id: Mapped[uuid.UUID] = pk()
    resume_id: Mapped[uuid.UUID] = fk("resumes.id")
    version_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("resume_versions.id", ondelete="SET NULL"))
    analysis_type: Mapped[str] = mapped_column(String(20))  # ats | validation
    job_description: Mapped[str | None] = mapped_column(Text)
    result: Mapped[dict] = mapped_column(JSON)
    score: Mapped[int | None] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(TS, default=utcnow)


# ============================================================ salary


class SalarySource(Base):
    __tablename__ = "salary_sources"
    id: Mapped[uuid.UUID] = pk()
    name: Mapped[str] = mapped_column(String(160))
    url: Mapped[str | None] = mapped_column(String(400))
    type: Mapped[str] = mapped_column(String(40))  # job_postings | government | licensed
    license: Mapped[str | None] = mapped_column(String(200))
    last_update: Mapped[datetime | None] = mapped_column(TS)


class SalaryAssessment(Base):
    __tablename__ = "salary_assessments"
    id: Mapped[uuid.UUID] = pk()
    user_id: Mapped[uuid.UUID] = fk("users.id")
    occupation: Mapped[str] = mapped_column(String(160))
    location: Mapped[str | None] = mapped_column(String(120))
    currency: Mapped[str] = mapped_column(String(3))
    low: Mapped[float | None] = mapped_column(Float)
    mid: Mapped[float | None] = mapped_column(Float)
    high: Mapped[float | None] = mapped_column(Float)
    confidence: Mapped[str] = mapped_column(String(10))
    market: Mapped[dict] = mapped_column(JSON, default=dict)
    explanation: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(TS, default=utcnow)


# ============================================================ job board (ingested vacancies)


class JobSource(Timestamps, Base):
    __tablename__ = "job_sources"
    id: Mapped[uuid.UUID] = pk()
    kind: Mapped[str] = mapped_column(String(20))  # hh_rss | telegram
    name: Mapped[str] = mapped_column(String(160))
    config: Mapped[dict] = mapped_column(JSON, default=dict)
    # hh_rss: {"host": "hh.kz", "text": "python", "area": "40", "pages": 3}
    # telegram: {"channel": "jobkz_1", "pages": 3}
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    last_run_at: Mapped[datetime | None] = mapped_column(TS)
    last_status: Mapped[str | None] = mapped_column(String(20))
    last_error: Mapped[str | None] = mapped_column(Text)
    last_found: Mapped[int] = mapped_column(Integer, default=0)
    last_created: Mapped[int] = mapped_column(Integer, default=0)


class Job(Base):
    __tablename__ = "jobs"
    id: Mapped[uuid.UUID] = pk()
    source_id: Mapped[uuid.UUID | None] = fk("job_sources.id", nullable=True, ondelete="SET NULL")
    source_kind: Mapped[str] = mapped_column(String(20), index=True)
    source_name: Mapped[str] = mapped_column(String(160))
    external_id: Mapped[str] = mapped_column(String(160))
    url: Mapped[str] = mapped_column(String(500))
    title: Mapped[str] = mapped_column(String(300))
    company: Mapped[str | None] = mapped_column(String(200))
    location: Mapped[str | None] = mapped_column(String(160), index=True)
    salary_min: Mapped[float | None] = mapped_column(Float)
    salary_max: Mapped[float | None] = mapped_column(Float)
    currency: Mapped[str | None] = mapped_column(String(3))
    salary_text: Mapped[str | None] = mapped_column(String(160))
    salary_period: Mapped[str | None] = mapped_column(String(10))  # year | month | week | day | hour
    company_logo: Mapped[str | None] = mapped_column(String(500))
    employment_type: Mapped[str | None] = mapped_column(String(30))
    work_format: Mapped[str | None] = mapped_column(String(20))  # remote | office | hybrid
    seniority: Mapped[str | None] = mapped_column(String(20))
    category: Mapped[str | None] = mapped_column(String(60), index=True)
    description: Mapped[str | None] = mapped_column(Text)
    tags: Mapped[list] = mapped_column(JSON, default=list)
    contacts: Mapped[list] = mapped_column(JSON, default=list)
    fingerprint: Mapped[str] = mapped_column(String(64), index=True)
    published_at: Mapped[datetime | None] = mapped_column(TS, index=True)
    fetched_at: Mapped[datetime] = mapped_column(TS, default=utcnow)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    is_duplicate: Mapped[bool] = mapped_column(Boolean, default=False)
    __table_args__ = (UniqueConstraint("source_kind", "external_id"),)


class IngestionRun(Base):
    __tablename__ = "ingestion_runs"
    id: Mapped[uuid.UUID] = pk()
    source_id: Mapped[uuid.UUID | None] = fk("job_sources.id", nullable=True, ondelete="SET NULL")
    source_name: Mapped[str] = mapped_column(String(160))
    started_at: Mapped[datetime] = mapped_column(TS, default=utcnow)
    finished_at: Mapped[datetime | None] = mapped_column(TS)
    status: Mapped[str] = mapped_column(String(20), default="running")  # running|success|failed
    fetched: Mapped[int] = mapped_column(Integer, default=0)
    created: Mapped[int] = mapped_column(Integer, default=0)
    updated: Mapped[int] = mapped_column(Integer, default=0)
    skipped: Mapped[int] = mapped_column(Integer, default=0)
    error: Mapped[str | None] = mapped_column(Text)


class SavedJob(Base):
    __tablename__ = "saved_jobs"
    id: Mapped[uuid.UUID] = pk()
    user_id: Mapped[uuid.UUID] = fk("users.id")
    job_id: Mapped[uuid.UUID] = fk("jobs.id")
    created_at: Mapped[datetime] = mapped_column(TS, default=utcnow)
    __table_args__ = (UniqueConstraint("user_id", "job_id"),)


# ============================================================ job tracker


class JobApplication(Timestamps, Base):
    __tablename__ = "job_applications"
    id: Mapped[uuid.UUID] = pk()
    user_id: Mapped[uuid.UUID] = fk("users.id")
    job_id: Mapped[uuid.UUID | None] = fk("jobs.id", nullable=True, ondelete="SET NULL")
    company_name: Mapped[str] = mapped_column(String(200))
    company_website: Mapped[str | None] = mapped_column(String(300))
    job_title: Mapped[str] = mapped_column(String(200))
    job_url: Mapped[str | None] = mapped_column(String(500))
    description: Mapped[str | None] = mapped_column(Text)
    location: Mapped[str | None] = mapped_column(String(160))
    employment_type: Mapped[str | None] = mapped_column(String(30))
    work_arrangement: Mapped[str | None] = mapped_column(String(20))
    salary_min: Mapped[float | None] = mapped_column(Float)
    salary_max: Mapped[float | None] = mapped_column(Float)
    currency: Mapped[str | None] = mapped_column(String(3))
    applied_at: Mapped[date | None] = mapped_column(Date)
    resume_version_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("resume_versions.id", ondelete="SET NULL"), nullable=True)
    cover_letter: Mapped[str | None] = mapped_column(Text)
    recruiter_name: Mapped[str | None] = mapped_column(String(120))
    recruiter_email: Mapped[str | None] = mapped_column(String(200))
    notes: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(40), default="interested", index=True)
    sort: Mapped[float] = mapped_column(Float, default=0)


class ApplicationInterview(Timestamps, Base):
    __tablename__ = "application_interviews"
    id: Mapped[uuid.UUID] = pk()
    application_id: Mapped[uuid.UUID] = fk("job_applications.id")
    title: Mapped[str] = mapped_column(String(160))
    type: Mapped[str] = mapped_column(String(40), default="video")
    scheduled_at: Mapped[datetime] = mapped_column(TS)
    timezone: Mapped[str | None] = mapped_column(String(60))
    duration_min: Mapped[int] = mapped_column(Integer, default=60)
    interviewer: Mapped[str | None] = mapped_column(String(160))
    platform: Mapped[str | None] = mapped_column(String(60))
    meeting_url: Mapped[str | None] = mapped_column(String(500))
    location: Mapped[str | None] = mapped_column(String(200))
    notes: Mapped[str | None] = mapped_column(Text)
    feedback: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(20), default="scheduled")


class ApplicationEvent(Base):
    __tablename__ = "application_events"
    id: Mapped[uuid.UUID] = pk()
    application_id: Mapped[uuid.UUID] = fk("job_applications.id")
    type: Mapped[str] = mapped_column(String(40))
    from_status: Mapped[str | None] = mapped_column(String(40))
    to_status: Mapped[str | None] = mapped_column(String(40))
    note: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(TS, default=utcnow)


class Reminder(Base):
    __tablename__ = "application_reminders"
    id: Mapped[uuid.UUID] = pk()
    user_id: Mapped[uuid.UUID] = fk("users.id")
    application_id: Mapped[uuid.UUID | None] = fk("job_applications.id", nullable=True)
    type: Mapped[str] = mapped_column(String(30), default="custom")
    title: Mapped[str] = mapped_column(String(200))
    due_at: Mapped[datetime] = mapped_column(TS, index=True)
    done_at: Mapped[datetime | None] = mapped_column(TS)
    created_at: Mapped[datetime] = mapped_column(TS, default=utcnow)


# ============================================================ assistant


class AssistantConversation(Timestamps, Base):
    __tablename__ = "assistant_conversations"
    id: Mapped[uuid.UUID] = pk()
    user_id: Mapped[uuid.UUID] = fk("users.id")
    title: Mapped[str] = mapped_column(String(200), default="New conversation")


class AssistantMessage(Base):
    __tablename__ = "assistant_messages"
    id: Mapped[uuid.UUID] = pk()
    conversation_id: Mapped[uuid.UUID] = fk("assistant_conversations.id")
    role: Mapped[str] = mapped_column(String(20))  # user | assistant
    content: Mapped[str] = mapped_column(Text)
    meta: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(TS, default=utcnow)


# ============================================================ billing


class Plan(Timestamps, Base):
    __tablename__ = "plans"
    id: Mapped[uuid.UUID] = pk()
    slug: Mapped[str] = mapped_column(String(30), unique=True)
    name: Mapped[str] = mapped_column(String(60))
    tagline: Mapped[str | None] = mapped_column(String(200))
    price_month_cents: Mapped[int] = mapped_column(Integer, default=0)
    price_year_cents: Mapped[int] = mapped_column(Integer, default=0)
    limits: Mapped[dict] = mapped_column(JSON, default=dict)  # feature -> monthly limit (-1 = unlimited)
    features: Mapped[list] = mapped_column(JSON, default=list)  # marketing bullets
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    sort: Mapped[int] = mapped_column(Integer, default=0)


class Subscription(Timestamps, Base):
    __tablename__ = "subscriptions"
    id: Mapped[uuid.UUID] = pk()
    user_id: Mapped[uuid.UUID] = fk("users.id")
    plan_slug: Mapped[str] = mapped_column(String(30))
    interval: Mapped[str] = mapped_column(String(10), default="month")
    status: Mapped[str] = mapped_column(String(20), default="active")  # active|canceled|past_due|expired
    current_period_start: Mapped[datetime] = mapped_column(TS, default=utcnow)
    current_period_end: Mapped[datetime] = mapped_column(TS)
    cancel_at_period_end: Mapped[bool] = mapped_column(Boolean, default=False)
    provider: Mapped[str] = mapped_column(String(20), default="test")  # test | stripe | admin_grant
    provider_subscription_id: Mapped[str | None] = mapped_column(String(80), index=True)
    provider_customer_id: Mapped[str | None] = mapped_column(String(80))


class Payment(Base):
    __tablename__ = "payments"
    id: Mapped[uuid.UUID] = pk()
    user_id: Mapped[uuid.UUID] = fk("users.id")
    subscription_id: Mapped[uuid.UUID | None] = fk("subscriptions.id", nullable=True, ondelete="SET NULL")
    amount_cents: Mapped[int] = mapped_column(Integer)
    currency: Mapped[str] = mapped_column(String(3), default="USD")
    status: Mapped[str] = mapped_column(String(20), default="succeeded")
    description: Mapped[str] = mapped_column(String(200))
    is_test: Mapped[bool] = mapped_column(Boolean, default=True)
    provider_ref: Mapped[str | None] = mapped_column(String(120), index=True)  # Stripe invoice id, for idempotency
    created_at: Mapped[datetime] = mapped_column(TS, default=utcnow)


class UsageRecord(Base):
    __tablename__ = "usage_records"
    id: Mapped[uuid.UUID] = pk()
    user_id: Mapped[uuid.UUID] = fk("users.id")
    feature: Mapped[str] = mapped_column(String(40))
    period: Mapped[str] = mapped_column(String(7))  # YYYY-MM
    count: Mapped[int] = mapped_column(Integer, default=0)
    __table_args__ = (UniqueConstraint("user_id", "feature", "period"),)


# ============================================================ system


class Notification(Base):
    __tablename__ = "notifications"
    id: Mapped[uuid.UUID] = pk()
    user_id: Mapped[uuid.UUID] = fk("users.id")
    type: Mapped[str] = mapped_column(String(40))
    title: Mapped[str] = mapped_column(String(200))
    body: Mapped[str | None] = mapped_column(Text)
    link: Mapped[str | None] = mapped_column(String(300))
    read_at: Mapped[datetime | None] = mapped_column(TS)
    created_at: Mapped[datetime] = mapped_column(TS, default=utcnow, index=True)


class AuditLog(Base):
    __tablename__ = "audit_logs"
    id: Mapped[uuid.UUID] = pk()
    actor_id: Mapped[uuid.UUID | None] = fk("users.id", nullable=True, ondelete="SET NULL")
    action: Mapped[str] = mapped_column(String(60), index=True)
    entity_type: Mapped[str | None] = mapped_column(String(40))
    entity_id: Mapped[str | None] = mapped_column(String(64))
    details: Mapped[dict] = mapped_column(JSON, default=dict)
    ip: Mapped[str | None] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(TS, default=utcnow, index=True)


Index("ix_jobs_active_published", Job.is_active, Job.published_at)


class AICall(Base):
    """Metadata for every AI request (no prompt or output content is stored here)."""
    __tablename__ = "ai_calls"
    id: Mapped[uuid.UUID] = pk()
    user_id: Mapped[uuid.UUID | None] = fk("users.id", nullable=True, ondelete="SET NULL")
    task: Mapped[str] = mapped_column(String(60), index=True)
    prompt_version: Mapped[str] = mapped_column(String(20))
    model: Mapped[str] = mapped_column(String(60))
    status: Mapped[str] = mapped_column(String(20))  # ok | fallback | error | refused
    input_tokens: Mapped[int] = mapped_column(Integer, default=0)
    output_tokens: Mapped[int] = mapped_column(Integer, default=0)
    latency_ms: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(TS, default=utcnow, index=True)


# ============================================================ CRM & site content


class CrmRecord(Base):
    """Admin-side CRM fields for one customer. The lifecycle stage is computed; `stage` only stores a manual override."""
    __tablename__ = "crm_records"
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    stage: Mapped[str | None] = mapped_column(String(20))
    tags: Mapped[list] = mapped_column(JSON, default=list)
    owner_id: Mapped[uuid.UUID | None] = fk("users.id", nullable=True, ondelete="SET NULL", index=False)
    follow_up_at: Mapped[datetime | None] = mapped_column(TS)
    updated_at: Mapped[datetime] = mapped_column(TS, default=utcnow, onupdate=utcnow)


class CrmNote(Base):
    """A note, logged call/email, or task on a customer."""
    __tablename__ = "crm_notes"
    id: Mapped[uuid.UUID] = pk()
    user_id: Mapped[uuid.UUID] = fk("users.id")
    author_id: Mapped[uuid.UUID | None] = fk("users.id", nullable=True, ondelete="SET NULL", index=False)
    kind: Mapped[str] = mapped_column(String(10), default="note")  # note | call | email | task
    body: Mapped[str] = mapped_column(Text)
    due_at: Mapped[datetime | None] = mapped_column(TS)
    done: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(TS, default=utcnow, index=True)


class SiteContent(Base):
    """Editable site copy (announcement banner, landing hero, pricing FAQ) keyed by section."""
    __tablename__ = "site_content"
    key: Mapped[str] = mapped_column(String(60), primary_key=True)
    value: Mapped[dict] = mapped_column(JSON, default=dict)
    updated_by: Mapped[uuid.UUID | None] = fk("users.id", nullable=True, ondelete="SET NULL", index=False)
    updated_at: Mapped[datetime] = mapped_column(TS, default=utcnow, onupdate=utcnow)
