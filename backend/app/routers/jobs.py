"""Job board over ingested postings + outbound search links to platforms without public APIs."""
import uuid
from datetime import timedelta
from urllib.parse import quote_plus

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from ..db import get_db
from ..ingest.parse import annualize
from ..ingest.sources import ATTRIBUTION
from ..models import Job, JobApplication, SavedJob, User, utcnow
from ..security import get_current_user, optional_user

router = APIRouter(prefix="/jobs", tags=["jobs"])


def job_out(j: Job, saved: set | None = None, full: bool = False) -> dict:
    d = {"id": str(j.id), "title": j.title, "company": j.company, "company_logo": j.company_logo, "location": j.location,
         "salary_min": j.salary_min, "salary_max": j.salary_max, "currency": j.currency, "salary_period": j.salary_period,
         "salary_text": j.salary_text, "employment_type": j.employment_type, "work_format": j.work_format,
         "seniority": j.seniority, "category": j.category, "tags": j.tags or [], "url": j.url,
         "source": ATTRIBUTION.get(j.source_kind, j.source_kind), "source_kind": j.source_kind, "source_name": j.source_name,
         "published_at": j.published_at, "fetched_at": j.fetched_at, "saved": bool(saved and j.id in saved)}
    if full:
        d["description"] = j.description
        d["contacts"] = j.contacts or []
    else:
        d["snippet"] = (j.description or "")[:260]
    return d


def external_links(q: str, location: str) -> list[dict]:
    qq, ll = quote_plus(q or ""), quote_plus(location or "")
    return [
        {"name": "Indeed", "url": f"https://www.indeed.com/jobs?q={qq}&l={ll}"},
        {"name": "LinkedIn", "url": f"https://www.linkedin.com/jobs/search/?keywords={qq}&location={ll}"},
        {"name": "ZipRecruiter", "url": f"https://www.ziprecruiter.com/jobs-search?search={qq}&location={ll}"},
        {"name": "Monster", "url": f"https://www.monster.com/jobs/search?q={qq}&where={ll}"},
        {"name": "SimplyHired", "url": f"https://www.simplyhired.com/search?q={qq}&l={ll}"},
        {"name": "Wellfound", "url": "https://wellfound.com/jobs"},
    ]


@router.get("")
def search(
    q: str | None = Query(None, max_length=120),
    location: str | None = Query(None, max_length=120),
    remote: bool | None = None,
    category: str | None = None,
    seniority: str | None = None,
    employment_type: str | None = None,
    source: str | None = None,
    min_salary: float | None = Query(None, ge=0),
    with_salary: bool = False,
    posted_days: int | None = Query(None, ge=1, le=90),
    sort: str = "recent",
    page: int = Query(1, ge=1, le=200),
    per_page: int = Query(20, ge=1, le=50),
    user: User | None = Depends(optional_user),
    db: Session = Depends(get_db),
):
    stmt = select(Job).where(Job.is_active.is_(True), Job.is_duplicate.is_(False))
    if q:
        for term in q.split()[:5]:
            like = f"%{term}%"
            stmt = stmt.where(or_(Job.title.ilike(like), Job.company.ilike(like), Job.category.ilike(like)))
    if location:
        parts = [p.strip() for p in location.split(",") if p.strip()]
        stmt = stmt.where(or_(*[Job.location.ilike(f"%{p}%") for p in parts[:1]]))
    if remote:
        stmt = stmt.where(Job.work_format == "remote")
    if category:
        stmt = stmt.where(Job.category == category)
    if seniority:
        stmt = stmt.where(Job.seniority == seniority)
    if employment_type:
        stmt = stmt.where(Job.employment_type == employment_type)
    if source:
        stmt = stmt.where(Job.source_kind == source)
    if with_salary or min_salary:
        stmt = stmt.where(Job.salary_min.isnot(None))
    if posted_days:
        stmt = stmt.where(or_(Job.published_at >= utcnow() - timedelta(days=posted_days), Job.published_at.is_(None)))
    if min_salary:
        # compare on annualized pay; filter in SQL by the common yearly case and refine in Python
        stmt = stmt.where(or_(Job.salary_max >= min_salary, Job.salary_min >= min_salary, Job.salary_period.in_(["hour", "week", "day", "month"])))
    total = db.scalar(select(func.count()).select_from(stmt.subquery()))
    order = Job.salary_max.desc().nullslast() if sort == "salary" else Job.published_at.desc().nullslast()
    rows = db.scalars(stmt.order_by(order, Job.id).offset((page - 1) * per_page).limit(per_page)).all()
    if min_salary:
        rows = [j for j in rows if (annualize(j.salary_max or j.salary_min, j.salary_period) or 0) >= min_salary]
    saved = set()
    if user:
        saved = set(db.scalars(select(SavedJob.job_id).where(SavedJob.user_id == user.id)))
    return {"items": [job_out(j, saved) for j in rows], "total": total, "page": page, "per_page": per_page,
            "external_search": external_links(q or "", location or "")}


@router.get("/facets")
def facets(db: Session = Depends(get_db)):
    base = (Job.is_active.is_(True), Job.is_duplicate.is_(False))
    cats = db.execute(select(Job.category, func.count()).where(*base).group_by(Job.category).order_by(func.count().desc())).all()
    srcs = db.execute(select(Job.source_kind, func.count()).where(*base).group_by(Job.source_kind).order_by(func.count().desc())).all()
    total = db.scalar(select(func.count(Job.id)).where(*base))
    with_salary = db.scalar(select(func.count(Job.id)).where(*base, Job.salary_min.isnot(None)))
    remote = db.scalar(select(func.count(Job.id)).where(*base, Job.work_format == "remote"))
    companies = db.scalar(select(func.count(func.distinct(Job.company))).where(*base))
    latest = db.scalar(select(func.max(Job.fetched_at)))
    return {"total": total, "with_salary": with_salary, "remote": remote, "companies": companies, "updated_at": latest,
            "categories": [{"name": c or "Other", "count": n} for c, n in cats],
            "sources": [{"kind": k, "name": ATTRIBUTION.get(k, k), "count": n} for k, n in srcs]}


_hist_cache: dict = {}


@router.get("/salary-histogram")
def salary_histogram(db: Session = Depends(get_db)):
    """Distribution of posted yearly base pay across active US listings (powers the landing hero)."""
    import statistics
    import time

    hit = _hist_cache.get("v")
    if hit and time.time() - hit[0] < 600:
        return hit[1]
    rows = db.execute(select(Job.salary_min, Job.salary_max, Job.salary_period).where(
        Job.is_active.is_(True), Job.is_duplicate.is_(False), Job.salary_min.isnot(None), Job.currency == "USD")).all()
    vals = []
    for lo, hi, period in rows:
        a = annualize(lo, period)
        b = annualize(hi, period) if hi else None
        v = (a + b) / 2 if a and b else a
        if v and 30_000 <= v <= 400_000:
            vals.append(v)
    step, start, n = 10_000, 30_000, 37
    bins = [0] * n
    for v in vals:
        bins[min(n - 1, int((v - start) // step))] += 1
    out = {"count": len(vals), "median": round(statistics.median(vals)) if vals else None,
           "p25": round(sorted(vals)[len(vals) // 4]) if vals else None,
           "p75": round(sorted(vals)[3 * len(vals) // 4]) if vals else None,
           "start": start, "step": step, "bins": bins}
    _hist_cache["v"] = (time.time(), out)
    return out


@router.get("/saved")
def saved_jobs(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.execute(select(Job).join(SavedJob, SavedJob.job_id == Job.id).where(SavedJob.user_id == user.id)
                      .order_by(SavedJob.created_at.desc())).scalars().all()
    ids = {j.id for j in rows}
    return [job_out(j, ids) for j in rows]


@router.get("/{job_id}")
def get_job(job_id: uuid.UUID, user: User | None = Depends(optional_user), db: Session = Depends(get_db)):
    j = db.get(Job, job_id)
    if not j:
        raise HTTPException(404, "This job is no longer available.")
    saved = set()
    tracked = None
    if user:
        saved = set(db.scalars(select(SavedJob.job_id).where(SavedJob.user_id == user.id, SavedJob.job_id == j.id)))
        a = db.scalar(select(JobApplication).where(JobApplication.user_id == user.id, JobApplication.job_id == j.id))
        tracked = {"id": str(a.id), "status": a.status} if a else None
    d = job_out(j, saved, full=True)
    d["application"] = tracked
    similar = db.scalars(select(Job).where(Job.is_active.is_(True), Job.category == j.category, Job.id != j.id,
                                           Job.is_duplicate.is_(False)).order_by(Job.published_at.desc().nullslast()).limit(4)).all()
    d["similar"] = [job_out(s) for s in similar]
    return d


@router.post("/{job_id}/save")
def save(job_id: uuid.UUID, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not db.get(Job, job_id):
        raise HTTPException(404, "Job not found.")
    if not db.scalar(select(SavedJob).where(SavedJob.user_id == user.id, SavedJob.job_id == job_id)):
        db.add(SavedJob(user_id=user.id, job_id=job_id))
        db.commit()
    return {"saved": True}


@router.delete("/{job_id}/save")
def unsave(job_id: uuid.UUID, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    s = db.scalar(select(SavedJob).where(SavedJob.user_id == user.id, SavedJob.job_id == job_id))
    if s:
        db.delete(s)
        db.commit()
    return {"saved": False}
