"""Ingestion orchestration: run sources, upsert jobs, dedupe across sources, expire stale postings.

CLI:
  python -m app.ingest.runner            # run all active sources once
  python -m app.ingest.runner --loop     # run forever every INGEST_INTERVAL_MINUTES
  python -m app.ingest.runner --source jobkz_1
"""
import argparse
import logging
import time
import traceback
from datetime import timedelta, timezone

from sqlalchemy import and_, or_, select, update
from sqlalchemy.orm import Session

from ..config import get_settings
from ..db import SessionLocal
from ..models import IngestionRun, Job, JobSource, utcnow
from . import parse
from .sources import FETCHERS

log = logging.getLogger("bespoke.ingest")
settings = get_settings()

TALENT_QUERIES = [
    ("software engineer", "New York, NY"), ("registered nurse", "Houston, TX"), ("data analyst", "Chicago, IL"),
    ("product manager", "San Francisco, CA"), ("marketing manager", "Los Angeles, CA"), ("accountant", "Dallas, TX"),
    ("project manager", "Atlanta, GA"), ("customer service", "Phoenix, AZ"), ("sales representative", "Miami, FL"),
    ("teacher", "Seattle, WA"), ("graphic designer", "Austin, TX"), ("internship", "Boston, MA"),
    ("medical assistant", "Denver, CO"), ("financial analyst", "Charlotte, NC"), ("electrician", "Columbus, OH"),
    ("human resources", "Philadelphia, PA"),
]
GREENHOUSE = ["airbnb", "stripe", "figma", "discord", "robinhood", "coinbase", "lyft", "pinterest", "reddit", "dropbox",
              "databricks", "gitlab", "asana", "duolingo", "instacart", "cloudflare", "twitch", "affirm", "brex", "gusto",
              "chime", "datadog", "mongodb", "elastic", "okta", "doordashusa", "toast", "squarespace"]
ASHBY = [("ramp", "Ramp"), ("notion", "Notion"), ("openai", "OpenAI"), ("linear", "Linear"), ("replit", "Replit"),
         ("posthog", "PostHog"), ("supabase", "Supabase"), ("cursor", "Cursor")]
LEVER = [("spotify", "Spotify"), ("palantir", "Palantir"), ("zoox", "Zoox")]
NICE = {"doordashusa": "DoorDash", "gitlab": "GitLab", "mongodb": "MongoDB", "okta": "Okta"}

DEFAULT_SOURCES = (
    [("talent", f"Talent.com · {k.title()} · {l}", {"k": k, "l": l, "pages": 2, "min_interval_minutes": 360})
     for k, l in TALENT_QUERIES]
    + [("greenhouse", f"{NICE.get(b, b.title())} careers", {"board": b, "company": NICE.get(b, b.title()),
                                                          "min_interval_minutes": 360}) for b in GREENHOUSE]
    + [("ashby", f"{n} careers", {"board": b, "company": n, "min_interval_minutes": 360}) for b, n in ASHBY]
    + [("lever", f"{n} careers", {"company": b, "company_name": n, "min_interval_minutes": 360}) for b, n in LEVER]
    + [("remotive", "Remotive · remote jobs", {"min_interval_minutes": 360}),
       ("remoteok", "Remote OK · remote jobs", {"min_interval_minutes": 180}),
       ("himalayas", "Himalayas · remote jobs", {"pages": 10, "min_interval_minutes": 180}),
       ("jobicy", "Jobicy · remote jobs (USA)", {"geo": "usa", "min_interval_minutes": 180}),
       ]
)
# Keyed sources stay off until the API keys are configured (see .env.example).
INACTIVE_SOURCES = [
    ("adzuna", "Adzuna · United States", {"what": "", "where": "", "pages": 4, "min_interval_minutes": 180}),
    ("usajobs", "USAJOBS · federal jobs", {"keyword": "", "limit": 250, "min_interval_minutes": 360}),
    # English-language US job channels on Telegram are scarce; these two mostly post career tips.
    ("telegram", "Telegram · Remote Jobs", {"channel": "remotejobs", "pages": 3, "min_interval_minutes": 120}),
    ("telegram", "Telegram · CryptoJobsList", {"channel": "cryptojobslist", "pages": 3, "min_interval_minutes": 120}),
]


def ensure_default_sources(db: Session) -> None:
    if db.scalar(select(JobSource.id).limit(1)):
        return
    for kind, name, cfg in DEFAULT_SOURCES:
        db.add(JobSource(kind=kind, name=name, config=cfg))
    for kind, name, cfg in INACTIVE_SOURCES:
        db.add(JobSource(kind=kind, name=name, config=cfg, is_active=False))
    db.commit()


FIELDS = ("url", "title", "company", "location", "salary_min", "salary_max", "currency", "salary_text",
          "salary_period", "company_logo",
          "employment_type", "work_format", "seniority", "category", "description", "tags", "contacts", "published_at")


def upsert(db: Session, src: JobSource, items: list[dict]) -> tuple[int, int, int]:
    created = updated = skipped = 0
    now = utcnow()
    seen: set[str] = set()
    for it in items:
        if not it.get("title") or not it.get("url") or it["external_id"] in seen:
            skipped += 1
            continue
        seen.add(it["external_id"])
        fp = parse.fingerprint(it["title"], it.get("company"), it.get("location"))
        job = db.scalar(select(Job).where(Job.source_kind == src.kind, Job.external_id == it["external_id"]))
        if job:
            for f in FIELDS:
                v = it.get(f)
                if v not in (None, [], ""):
                    setattr(job, f, v)
            job.fetched_at, job.is_active, job.fingerprint = now, True, fp
            updated += 1
            continue
        dup = db.scalar(select(Job.id).where(Job.fingerprint == fp, Job.is_active.is_(True),
                                             Job.source_kind != src.kind, Job.is_duplicate.is_(False)).limit(1))
        job = Job(source_id=src.id, source_kind=src.kind, source_name=it.get("source_label") or src.name,
                  external_id=it["external_id"], fingerprint=fp, fetched_at=now, is_duplicate=bool(dup),
                  **{f: it.get(f) for f in FIELDS})
        db.add(job)
        created += 1
    db.flush()
    return created, updated, skipped


def run_source(db: Session, src: JobSource) -> IngestionRun:
    run = IngestionRun(source_id=src.id, source_name=src.name)
    db.add(run)
    src.last_status = "running"
    db.commit()
    try:
        items = FETCHERS[src.kind](src.config or {})
        run.fetched = len(items)
        run.created, run.updated, run.skipped = upsert(db, src, items)
        if src.kind in FULL_LISTING:
            # These APIs return every open posting, so anything not returned has closed.
            db.execute(update(Job).where(Job.source_id == src.id, Job.is_active.is_(True),
                                         Job.fetched_at < run.started_at).values(is_active=False))
        run.status = "success"
        src.last_error = None
    except Exception as e:  # noqa: BLE001 — record any source failure, keep going with others
        db.rollback()
        run = db.merge(run)
        src = db.merge(src)
        run.status = "failed"
        run.error = f"{type(e).__name__}: {e}"[:2000]
        src.last_error = run.error
        log.warning("source %s failed: %s\n%s", src.name, e, traceback.format_exc(limit=3))
    run.finished_at = utcnow()
    src.last_run_at, src.last_status = run.finished_at, run.status
    src.last_found, src.last_created = run.fetched, run.created
    db.commit()
    return run


FULL_LISTING = {"greenhouse", "ashby", "lever", "remotive", "remoteok", "jobicy"}


def expire_stale(db: Session) -> int:
    """Windowed sources (search pages, channels): drop postings not seen for a week or too old to be open."""
    now = utcnow()
    res = db.execute(update(Job).where(Job.is_active.is_(True), or_(
        Job.fetched_at < now - timedelta(days=7),
        and_(Job.source_kind.in_(["telegram", "talent", "adzuna"]),
             Job.published_at < now - timedelta(days=settings.job_ttl_days)))).values(is_active=False))
    db.commit()
    return res.rowcount or 0


def _due(src: JobSource, force: bool) -> bool:
    if force or not src.last_run_at:
        return True
    last = src.last_run_at if src.last_run_at.tzinfo else src.last_run_at.replace(tzinfo=timezone.utc)
    return utcnow() - last >= timedelta(minutes=int((src.config or {}).get("min_interval_minutes", 60)))


def run_all(only: str | None = None, force: bool = False) -> list[dict]:
    db = SessionLocal()
    try:
        ensure_default_sources(db)
        stmt = select(JobSource).where(JobSource.is_active.is_(True)).order_by(JobSource.kind, JobSource.name)
        results = []
        for src in db.scalars(stmt).all():
            if only and only not in (src.name, src.kind, (src.config or {}).get("channel"),
                                     (src.config or {}).get("board"), str(src.id)):
                continue
            if not _due(src, force or bool(only)):
                continue
            r = run_source(db, src)
            results.append({"source": src.name, "status": r.status, "fetched": r.fetched,
                            "created": r.created, "updated": r.updated, "error": r.error})
            log.info("%-40s %-8s fetched=%s created=%s updated=%s", src.name, r.status, r.fetched, r.created, r.updated)
        expired = expire_stale(db)
        log.info("expired %s stale jobs", expired)
        return results
    finally:
        db.close()


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    ap = argparse.ArgumentParser()
    ap.add_argument("--loop", action="store_true")
    ap.add_argument("--source")
    ap.add_argument("--force", action="store_true")
    a = ap.parse_args()
    if not a.loop:
        run_all(a.source, a.force)
        return
    while True:
        try:
            run_all(a.source)
        except Exception:  # noqa: BLE001
            log.exception("ingestion cycle failed")
        time.sleep(max(5, settings.ingest_interval_minutes) * 60)


if __name__ == "__main__":
    main()
