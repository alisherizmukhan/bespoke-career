"""Idempotent seed: plans, knowledge base, admin (ADMIN_EMAIL / ADMIN_PASSWORD) and an optional demo account.

Demo login (SEED_DEMO_DATA=true): alex@demo.bespoke.app / DemoBespoke2026
"""
from datetime import date, timedelta

from sqlalchemy import select

from .config import get_settings
from .db import SessionLocal
from .entitlements import PLAN_DEFAULTS
from .ingest.runner import ensure_default_sources
from .models import (ApplicationEvent, ApplicationInterview, DocumentType, Industry, JobApplication, Occupation, Plan,
                     Reminder, Resume, ResumeGuideline, ResumeVersion, SalarySource, User, UserProfile, UserSkill, utcnow)
from .resume.knowledge import DOCUMENT_TYPES, GUIDELINES, INDUSTRIES, OCCUPATIONS
from .resume.schema import Certification, Contact, Education, Experience, Project, ResumeContent
from .security import hash_password

settings = get_settings()
DEMO_EMAIL, DEMO_PW = "alex@demo.bespoke.app", "DemoBespoke2026"


def run() -> None:
    db = SessionLocal()
    try:
        for d in PLAN_DEFAULTS:
            if not db.scalar(select(Plan).where(Plan.slug == d["slug"])):
                db.add(Plan(**d))
        if not db.scalar(select(Industry.id).limit(1)):
            ids = {}
            for i, (slug, name) in enumerate(INDUSTRIES):
                ind = Industry(slug=slug, name=name, sort=i)
                db.add(ind)
                db.flush()
                ids[slug] = ind.id
            for ind, title, soc, keys, docs in OCCUPATIONS:
                db.add(Occupation(industry_id=ids[ind], title=title, soc_code=soc, keywords=keys, recommended_documents=docs))
            for d in DOCUMENT_TYPES:
                db.add(DocumentType(slug=d["slug"], name=d["name"], description=d["description"], sections=d["sections"],
                                    max_pages=d["max_pages"]))
            for cat, ind, doc, text, url, stype, conf in GUIDELINES:
                db.add(ResumeGuideline(category=cat, industry_slug=ind, document_type=doc, country="US", text=text,
                                       source_url=url, source_type=stype, confidence=conf, is_verified=bool(url),
                                       last_verified=date.today() if url else None))
            db.add(SalarySource(name="Public job postings with disclosed pay (Greenhouse, Ashby, Lever, Talent.com, "
                                     "Remotive, Remote OK, Himalayas, Jobicy)", type="job_postings",
                                license="Public listings via official APIs / robots-permitted pages; used for aggregate statistics"))
        if not db.scalar(select(User).where(User.role == "admin")):
            u = User(email=settings.admin_email.lower(), password_hash=hash_password(settings.admin_password), role="admin",
                     email_verified_at=utcnow())
            db.add(u)
            db.flush()
            db.add(UserProfile(user_id=u.id, full_name="Bespoke Admin", onboarding_completed=True))
            print("seed: admin created")
        db.commit()
        ensure_default_sources(db)
        if settings.seed_demo_data and not db.scalar(select(User).where(User.email == DEMO_EMAIL)):
            _demo(db)
            db.commit()
            print("seed: demo account created")
    finally:
        db.close()


def _demo(db) -> None:
    now = utcnow()
    u = User(email=DEMO_EMAIL, password_hash=hash_password(DEMO_PW), email_verified_at=now)
    db.add(u)
    db.flush()
    db.add(UserProfile(
        user_id=u.id, profile_type="professional", full_name="Alex Morgan", country="United States", city="Austin, TX",
        employment_status="employed", industry="technology", occupation="Software Developer",
        current_title="Software Engineer", years_experience=4, seniority="mid", target_title="Senior Software Engineer",
        career_goals="Move into a senior backend role at a product company and grow toward technical leadership.",
        employment_types=["full-time"], work_formats=["remote", "hybrid"], salary_min=150000, salary_max=185000, currency="USD",
        linkedin_url="https://www.linkedin.com/in/alex-morgan-demo",
        education=[{"degree": "B.S.", "field": "Computer Science", "institution": "University of Texas at Austin", "end": "2020"}],
        certifications=["AWS Certified Developer – Associate"], onboarding_completed=True))
    for s in ["Python", "Django", "PostgreSQL", "AWS", "Docker", "React", "REST API", "CI/CD"]:
        db.add(UserSkill(user_id=u.id, skill=s, verified=True))
    content = ResumeContent(
        contact=Contact(full_name="Alex Morgan", email=DEMO_EMAIL, phone="(512) 555-0147", location="Austin, TX",
                        linkedin="linkedin.com/in/alex-morgan-demo"),
        headline="Software Engineer — Python, Django, AWS",
        summary="Backend-focused software engineer with 4 years of experience building Python services and APIs for "
                "B2B SaaS products. Comfortable owning features end to end, from data model to deployment.",
        experience=[
            Experience(title="Software Engineer", company="Northwind Analytics", location="Austin, TX", start="Mar 2022",
                       current=True, bullets=[
                           "Built and maintain Django REST APIs used by 40+ enterprise customers.",
                           "Cut report generation time from 12 minutes to 90 seconds by moving jobs to Celery and optimizing PostgreSQL queries.",
                           "Led the migration of three services to Docker and AWS ECS with a GitHub Actions CI/CD pipeline.",
                           "Mentored two junior engineers through code reviews and pairing."]),
            Experience(title="Junior Software Developer", company="Brightline Labs", location="Remote", start="Jul 2020",
                       end="Feb 2022", bullets=[
                           "Developed React and Django features for an internal scheduling tool.",
                           "Responsible for writing unit tests and fixing production bugs."]),
        ],
        education=[Education(degree="B.S.", field="Computer Science", institution="University of Texas at Austin", end="2020")],
        skills=["Python", "Django", "PostgreSQL", "AWS", "Docker", "React", "REST API", "CI/CD", "Celery", "Git"],
        certifications=[Certification(name="AWS Certified Developer – Associate", issuer="Amazon Web Services", date="2023")],
        projects=[Project(name="Open-source rate limiter", description="Python library for token-bucket rate limiting.",
                          url="github.com/alexmorgan/ratelimit")],
    )
    r = Resume(user_id=u.id, title="Alex Morgan — Software Engineer", document_type="professional",
               parsed_content=content.model_dump(), status="verified")
    db.add(r)
    db.flush()
    v = ResumeVersion(resume_id=r.id, version=1, name="Professional Resume v1", content=content.model_dump(), source="generated")
    db.add(v)
    db.flush()
    apps = [
        ("Stripe", "Backend Engineer, Payments", "applied", 12, "Remote (US)", 165000, 220000),
        ("Datadog", "Software Engineer II - APIs", "interview", 9, "Austin, TX", 150000, 190000),
        ("Ramp", "Senior Software Engineer", "screening", 6, "New York, NY", 180000, 240000),
        ("Gusto", "Software Engineer, Platform", "rejected", 20, "Remote (US)", 140000, 175000),
        ("Duolingo", "Senior Backend Engineer", "interested", 0, "Pittsburgh, PA", 170000, 210000),
        ("Toast", "Software Engineer II", "preparing", 0, "Boston, MA", 135000, 170000),
    ]
    for comp, title, status, days, loc, lo, hi in apps:
        a = JobApplication(user_id=u.id, company_name=comp, job_title=title, status=status, location=loc, salary_min=lo,
                           salary_max=hi, currency="USD", employment_type="full-time",
                           applied_at=(now - timedelta(days=days)).date() if days else None,
                           resume_version_id=v.id if days else None)
        db.add(a)
        db.flush()
        a.updated_at = now - timedelta(days=days)
        db.add(ApplicationEvent(application_id=a.id, type="created", to_status=status))
        if status == "interview":
            db.add(ApplicationInterview(application_id=a.id, title="Technical interview", type="video",
                                        scheduled_at=now + timedelta(days=3, hours=2), duration_min=60, interviewer="Priya S., Engineering Manager",
                                        platform="Zoom", meeting_url="https://zoom.us/j/0000000000", timezone="America/Chicago"))
            db.add(Reminder(user_id=u.id, application_id=a.id, type="interview", title="Prepare STAR stories for Datadog",
                            due_at=now + timedelta(days=2)))
    db.add(Reminder(user_id=u.id, type="follow_up", title="Follow up with Stripe recruiter", due_at=now + timedelta(hours=20)))


if __name__ == "__main__":
    run()
