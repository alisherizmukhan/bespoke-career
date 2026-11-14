"""Unit + integration tests mapped to spec §25 (entitlements, permissions, parsing/validation, salary, status, security)."""
import io
from datetime import timedelta

import docx

from app.db import SessionLocal
from app.ingest import parse
from app.models import Job, utcnow
from app.resume import analysis, parser
from app.resume.schema import Experience, ResumeContent
from app.salary import market_research

from .conftest import API, make_admin, register

RESUME_TEXT = """JANE DOE
Senior Data Analyst
jane.doe@example.com | (512) 555-0101 | Austin, TX | linkedin.com/in/janedoe

SUMMARY
Data analyst with 6 years of experience in SQL, Python and Tableau.

EXPERIENCE
Senior Data Analyst | Acme Corp | Austin, TX   Jan 2021 - Present
• Built Tableau dashboards used by 300 sales reps.
• Automated weekly reporting with Python, saving 10 hours per week.
Data Analyst | Beta LLC   Jun 2018 - Dec 2020
• Wrote SQL queries for marketing analytics.

EDUCATION
University of Texas at Austin   2018
B.S. Statistics

SKILLS
SQL, Python, Tableau, Excel, A/B testing
"""


def _docx(text: str) -> bytes:
    d = docx.Document()
    for line in text.splitlines():
        d.add_paragraph(line)
    buf = io.BytesIO()
    d.save(buf)
    return buf.getvalue()


# ---------------------------------------------------------------- auth & permissions

def test_register_login_wrong_password(client):
    register(client)
    assert client.post(f"{API}/auth/login", json={"email": "a@test.io", "password": "Passw0rd!x"}).status_code == 200
    assert client.post(f"{API}/auth/login", json={"email": "a@test.io", "password": "wrong-pass1"}).status_code == 401


def test_admin_only(client):
    h = register(client)
    assert client.get(f"{API}/admin/metrics", headers=h).status_code == 403
    assert client.get(f"{API}/admin/metrics", headers=make_admin(client)).status_code == 200
    assert client.get(f"{API}/dashboard").status_code == 401


def test_email_verification_single_use(client):
    r = client.post(f"{API}/auth/register", json={"full_name": "Bo Li", "email": "bo@test.io", "password": "Passw0rd!x",
                                                  "accept_terms": True})
    token = r.json()["dev_verification_url"].split("token=")[1]
    assert client.post(f"{API}/auth/verify-email", json={"token": token}).status_code == 200
    assert client.post(f"{API}/auth/verify-email", json={"token": token}).status_code == 400


# ---------------------------------------------------------------- resume parsing & validation

def test_heuristic_parse_extracts_sections():
    c = parser.heuristic_parse(RESUME_TEXT)
    assert c.contact.email == "jane.doe@example.com"
    assert c.contact.full_name == "Jane Doe"
    assert len(c.experience) == 2 and c.experience[0].current
    assert "Tableau" in c.skills
    assert c.education and "Texas" in c.education[0].institution


def test_upload_docx_parse_verify_generate_analyze_export(client):
    h = register(client)
    up = client.post(f"{API}/resume-intelligence/upload", headers=h,
                     files={"file": ("jane.docx", _docx(RESUME_TEXT),
                                     "application/vnd.openxmlformats-officedocument.wordprocessingml.document")})
    assert up.status_code == 201, up.text
    rid = up.json()["id"]
    # generation requires verification first
    assert client.post(f"{API}/resume-intelligence/generate", headers=h, json={"resume_id": rid}).status_code == 409
    content = up.json()["parsed_content"]
    assert client.put(f"{API}/resumes/{rid}/verify", headers=h, json={"content": content}).status_code == 200
    jd = "Senior Data Analyst\nRequirements: SQL, Python, Tableau, Looker and dbt. 5+ years.\nPreferred: Snowflake."
    g = client.post(f"{API}/resume-intelligence/generate", headers=h,
                    json={"resume_id": rid, "document_type": "ats", "job_description": jd})
    assert g.status_code == 201, g.text
    assert g.json()["validation"]["unsupported_claims"] == []
    a = client.post(f"{API}/resume-intelligence/analyze", headers=h, json={"resume_id": rid, "job_description": jd})
    assert a.status_code == 200
    kw = a.json()["keywords"]
    assert "sql" in kw["matched_required"] and "looker" in kw["missing_required"]
    for fmt in ("pdf", "docx"):
        e = client.post(f"{API}/resumes/{rid}/export", headers=h, json={"version_id": g.json()["version"]["id"], "format": fmt})
        assert e.status_code == 200 and len(e.content) > 1000


def test_invalid_file_rejected(client):
    h = register(client)
    r = client.post(f"{API}/resume-intelligence/upload", headers=h, files={"file": ("x.pdf", b"hello world", "application/pdf")})
    assert r.status_code == 415


def test_validation_flags_unsupported_claims():
    src = ResumeContent(experience=[Experience(title="Analyst", company="Acme", bullets=["Built dashboards."])])
    fake = src.model_copy(deep=True)
    fake.experience.append(Experience(title="Director", company="Google", bullets=["Grew revenue 300%."]))
    v = analysis.validate(fake, src, "professional")
    assert not v["ok"] and any("google" in x.lower() for x in v["unsupported_claims"])
    assert any("300" in x for x in v["unsupported_claims"])


# ---------------------------------------------------------------- entitlements

def test_free_plan_resume_generation_limit(client):
    h = register(client)
    rid = client.post(f"{API}/resumes/from-profile", headers=h, json={"title": "Mine"}).json()["id"]
    for _ in range(3):
        assert client.post(f"{API}/resume-intelligence/generate", headers=h, json={"resume_id": rid}).status_code == 201
    r = client.post(f"{API}/resume-intelligence/generate", headers=h, json={"resume_id": rid})
    assert r.status_code == 402 and r.json()["detail"]["code"] == "limit_reached"


def test_negotiation_not_in_free_then_upgrade(client):
    h = register(client)
    body = {"title": "data analyst", "base": 90000}
    assert client.post(f"{API}/salary-intelligence/negotiate", headers=h, json=body).json()["detail"]["code"] == "feature_not_included"
    assert client.post(f"{API}/billing/checkout", headers=h, json={"plan": "pro"}).status_code == 200
    sub = client.get(f"{API}/billing/subscription", headers=h).json()
    assert sub["plan"]["slug"] == "pro" and sub["test_mode"]


def test_application_limit_free(client):
    h = register(client)
    for i in range(5):
        assert client.post(f"{API}/applications", headers=h, json={"company_name": f"Co{i}", "job_title": "Analyst"}).status_code == 201
    assert client.post(f"{API}/applications", headers=h, json={"company_name": "Co6", "job_title": "Analyst"}).status_code == 402


# ---------------------------------------------------------------- job tracker

def test_application_status_events_and_isolation(client):
    h = register(client)
    a = client.post(f"{API}/applications", headers=h, json={"company_name": "Acme", "job_title": "Analyst"}).json()
    u = client.patch(f"{API}/applications/{a['id']}", headers=h, json={"status": "applied"}).json()
    assert u["applied_at"] and any(e["to"] == "applied" for e in u["events"])
    assert any(r["type"] == "follow_up" for r in u["reminders"])
    i = client.post(f"{API}/applications/{a['id']}/interviews", headers=h,
                    json={"title": "Phone screen", "scheduled_at": (utcnow() + timedelta(days=2)).isoformat()})
    assert i.status_code == 201
    assert client.get(f"{API}/applications/{a['id']}", headers=h).json()["status"] == "interview"
    other = register(client, "b@test.io")
    assert client.get(f"{API}/applications/{a['id']}", headers=other).status_code == 404
    assert client.patch(f"{API}/applications/{a['id']}", headers=other, json={"status": "hired"}).status_code == 404


def test_cross_user_resume_and_file_access(client):
    h = register(client)
    up = client.post(f"{API}/resume-intelligence/upload", headers=h,
                     files={"file": ("r.docx", _docx(RESUME_TEXT), "application/vnd.openxmlformats-officedocument.wordprocessingml.document")})
    rid, url = up.json()["id"], up.json()["original_url"]
    other = register(client, "b@test.io")
    assert client.get(f"{API}/resumes/{rid}", headers=other).status_code == 404
    path = url.split("://", 1)[1].split("/", 1)[1]
    assert client.get("/" + path).status_code == 200
    assert client.get("/" + path.replace("s=", "s=0")).status_code == 403  # tampered signature


# ---------------------------------------------------------------- salary & parsing helpers

def test_salary_parse_and_annualize():
    s = parse.parse_salary("Pay: $211.4K – $290.6K • Offers Equity")
    assert s["salary_min"] == 211400 and s["salary_max"] == 290600
    h = parse.parse_salary("$28.50/hr")
    assert h["salary_period"] == "hour" and parse.annualize(h["salary_min"], "hour") == 28.5 * 2080


def test_market_research_statistics():
    db = SessionLocal()
    for i, v in enumerate([90000, 100000, 110000, 120000, 130000, 140000]):
        db.add(Job(source_kind="test", source_name="t", external_id=f"t{i}", url="https://x", title="Data Analyst",
                   location="Austin, TX", salary_min=v, salary_max=v + 20000, currency="USD", salary_period="year",
                   fingerprint=str(i), fetched_at=utcnow()))
    db.commit()
    m = market_research(db, "data analyst", "Austin, TX")
    db.close()
    assert m["sample_size"] == 6 and m["stats"]["median"] == 125000 and m["stats"]["min"] == 100000


def test_us_location_filter():
    assert parse.is_us_location("San Francisco, CA • New York, NY")
    assert parse.is_us_location("Remote - USA")
    assert not parse.is_us_location("London, England")
    assert not parse.is_us_location("Toronto, Canada")


def test_account_export_and_delete(client):
    h = register(client)
    client.post(f"{API}/applications", headers=h, json={"company_name": "Acme", "job_title": "Analyst"})
    ex = client.get(f"{API}/account/export", headers=h)
    assert ex.status_code == 200 and len(ex.json()["applications"]) == 1
    assert client.post(f"{API}/account/delete", headers=h, json={"password": "Passw0rd!x"}).status_code == 200
    assert client.get(f"{API}/auth/me", headers=h).status_code == 401
