"""End-to-end walk through every API endpoint not already covered elsewhere.
AI keys are empty in tests, so AI features run on their rule-based fallbacks."""
from datetime import timedelta

from app.db import SessionLocal
from app.models import Job, utcnow

from .conftest import API, make_admin, register
from .test_core import RESUME_TEXT, _docx

DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"


def _seed_jobs(n=8):
    db = SessionLocal()
    ids = []
    for i in range(n):
        j = Job(source_kind="greenhouse", source_name="Acme careers", external_id=f"j{i}", url=f"https://jobs.example.com/{i}",
                title="Data Analyst" if i % 2 else "Senior Data Analyst", company=f"Acme {i}", location="Austin, TX",
                salary_min=90000 + i * 5000, salary_max=120000 + i * 5000, currency="USD", salary_period="year",
                description="SQL, Python, Tableau. 3+ years.", category="Data", fingerprint=f"fp{i}",
                published_at=utcnow(), fetched_at=utcnow())
        db.add(j)
        db.flush()
        ids.append(str(j.id))
    db.commit()
    db.close()
    return ids


def test_auth_account_lifecycle(client):
    r = client.post(f"{API}/auth/register", json={"full_name": "Kai Moss", "email": "kai@test.io", "password": "Passw0rd!x", "accept_terms": True})
    assert r.status_code == 201
    h = {"Authorization": f"Bearer {r.json()['access_token']}"}
    # duplicate, weak password, terms not accepted
    assert client.post(f"{API}/auth/register", json={"full_name": "Kai Moss", "email": "kai@test.io", "password": "Passw0rd!x", "accept_terms": True}).status_code == 409
    assert client.post(f"{API}/auth/register", json={"full_name": "X Y", "email": "x@test.io", "password": "short", "accept_terms": True}).status_code in (400, 422)
    assert client.post(f"{API}/auth/register", json={"full_name": "X Y", "email": "y@test.io", "password": "Passw0rd!x", "accept_terms": False}).status_code in (400, 422)

    assert client.get(f"{API}/auth/me", headers=h).json()["email"] == "kai@test.io"
    assert client.post(f"{API}/auth/resend-verification", headers=h).status_code == 200
    assert client.post(f"{API}/auth/forgot-password", json={"email": "kai@test.io"}).status_code == 200
    assert client.post(f"{API}/auth/forgot-password", json={"email": "nobody@test.io"}).status_code == 200  # no account enumeration
    assert client.post(f"{API}/auth/reset-password", json={"token": "bad", "password": "N3wPassw0rd!"}).status_code == 400
    assert client.post(f"{API}/auth/change-password", headers=h, json={"current_password": "wrong", "new_password": "N3wPassw0rd!"}).status_code in (400, 401)
    assert client.post(f"{API}/auth/change-password", headers=h, json={"current_password": "Passw0rd!x", "new_password": "N3wPassw0rd!"}).status_code == 200
    assert client.post(f"{API}/auth/login", json={"email": "kai@test.io", "password": "N3wPassw0rd!"}).status_code == 200
    assert client.post(f"{API}/auth/logout", headers=h).status_code == 200

    # preferences, export, delete
    h = {"Authorization": f"Bearer {client.post(f'{API}/auth/login', json={'email': 'kai@test.io', 'password': 'N3wPassw0rd!'}).json()['access_token']}"}
    assert client.patch(f"{API}/account/preferences", headers=h, json={"ai_consent": False}).status_code == 200
    assert client.get(f"{API}/account/preferences", headers=h).json()["ai_consent"] is False
    exp = client.get(f"{API}/account/export", headers=h)
    assert exp.status_code == 200 and "kai@test.io" in exp.text
    assert client.post(f"{API}/account/delete", headers=h, json={"password": "wrong"}).status_code in (400, 401, 403)
    assert client.post(f"{API}/account/delete", headers=h, json={"password": "N3wPassw0rd!"}).status_code == 200
    assert client.post(f"{API}/auth/login", json={"email": "kai@test.io", "password": "N3wPassw0rd!"}).status_code in (401, 403)


def test_profile_skills_onboarding(client):
    h = register(client)
    p = client.patch(f"{API}/profile", headers=h, json={"profile_type": "career_changer", "city": "Chicago", "current_title": "Teacher",
                                                       "target_title": "Data Analyst", "years_experience": 5, "seniority": "mid",
                                                       "skills": ["Excel", "SQL"], "onboarding_completed": True})
    assert p.status_code == 200
    prof = client.get(f"{API}/profile", headers=h).json()
    assert prof["target_title"] == "Data Analyst"
    s = client.post(f"{API}/profile/skills", headers=h, json={"skill": "Tableau", "category": "tool", "proficiency": 3})
    assert s.status_code == 201
    skills = client.get(f"{API}/profile/skills", headers=h).json()
    assert {"Excel", "SQL", "Tableau"} <= {x["skill"] for x in skills}
    assert client.delete(f"{API}/profile/skills/{s.json()['id']}", headers=h).status_code == 200
    assert client.get(f"{API}/auth/me", headers=h).json()["onboarding_completed"] is True


def test_jobs_board_save_and_salary_data(client):
    ids = _seed_jobs()
    h = register(client)
    lst = client.get(f"{API}/jobs?q=analyst&location=Austin").json()
    assert lst["total"] >= 8 and lst["items"]
    assert client.get(f"{API}/jobs/facets").status_code == 200
    hist = client.get(f"{API}/jobs/salary-histogram").json()
    assert hist["count"] == 8 and len(hist["bins"]) == 37
    assert client.get(f"{API}/jobs/{ids[0]}").json()["title"]
    assert client.post(f"{API}/jobs/{ids[0]}/save", headers=h).status_code in (200, 201)
    assert len(client.get(f"{API}/jobs/saved", headers=h).json()) == 1
    assert client.delete(f"{API}/jobs/{ids[0]}/save", headers=h).status_code == 200
    assert client.get(f"{API}/jobs/saved", headers=h).json() == []
    # applying straight from a job posting
    a = client.post(f"{API}/applications", headers=h, json={"job_id": ids[1]})
    assert a.status_code == 201 and a.json()["company_name"] == "Acme 1"

    # salary intelligence
    m = client.post(f"{API}/salary-intelligence/market-research", headers=h, json={"title": "data analyst", "location": "Austin, TX"})
    assert m.status_code == 200
    client.patch(f"{API}/profile", headers=h, json={"current_title": "Data Analyst", "city": "Austin", "years_experience": 4})
    asmt = client.post(f"{API}/salary-intelligence/assess", headers=h, json={"title": "Data Analyst", "location": "Austin, TX"})
    assert asmt.status_code == 201, asmt.text
    assert client.get(f"{API}/salary-intelligence/assessment/{asmt.json()['id']}", headers=h).status_code == 200
    assert len(client.get(f"{API}/salary-intelligence/history", headers=h).json()) == 1
    assert client.post(f"{API}/salary-intelligence/growth-plan", headers=h, json={}).status_code in (200, 402)


def test_tracker_interviews_reminders_dashboard_notifications(client):
    h = register(client)
    a = client.post(f"{API}/applications", headers=h, json={"company_name": "Globex", "job_title": "Analyst", "status": "interested"}).json()
    assert client.get(f"{API}/applications", headers=h).json()
    assert client.get(f"{API}/applications/pipeline", headers=h).status_code == 200
    assert client.get(f"{API}/applications/statistics", headers=h).status_code == 200
    i = client.post(f"{API}/applications/{a['id']}/interviews", headers=h,
                    json={"title": "Onsite", "scheduled_at": (utcnow() + timedelta(days=3)).isoformat()}).json()
    assert client.patch(f"{API}/interviews/{i['id']}", headers=h, json={"title": "Onsite loop", "scheduled_at": (utcnow() + timedelta(days=4)).isoformat(), "status": "completed", "feedback": "Went well"}).status_code == 200
    r1 = client.post(f"{API}/applications/{a['id']}/reminders", headers=h, json={"title": "Send thank-you", "due_at": (utcnow() + timedelta(days=1)).isoformat()})
    assert r1.status_code == 201
    r2 = client.post(f"{API}/reminders", headers=h, json={"title": "Update LinkedIn", "due_at": (utcnow() + timedelta(days=2)).isoformat()})
    assert r2.status_code == 201
    assert len(client.get(f"{API}/reminders", headers=h).json()) >= 2
    assert client.patch(f"{API}/reminders/{r2.json()['id']}", headers=h, json={"done": True}).status_code == 200
    dash = client.get(f"{API}/dashboard", headers=h)
    assert dash.status_code == 200
    assert client.get(f"{API}/notifications", headers=h).status_code == 200
    assert client.post(f"{API}/notifications/read", headers=h, json={}).status_code == 200
    assert client.delete(f"{API}/interviews/{i['id']}", headers=h).status_code == 200
    assert client.delete(f"{API}/applications/{a['id']}", headers=h).status_code == 200
    assert client.get(f"{API}/applications/{a['id']}", headers=h).status_code == 404


def test_resume_intelligence_versions_and_assistant(client):
    h = register(client)
    assert client.get(f"{API}/resume-intelligence/document-types", headers=h).json()
    up = client.post(f"{API}/resume-intelligence/upload", headers=h, files={"file": ("jane.docx", _docx(RESUME_TEXT), DOCX)}).json()
    rid = up["id"]
    assert client.post(f"{API}/resume-intelligence/parse", headers=h, json={"resume_id": rid}).status_code == 200
    client.put(f"{API}/resumes/{rid}/verify", headers=h, json={"content": up["parsed_content"]})
    assert client.post(f"{API}/resume-intelligence/classify-occupation", headers=h, json={"text": RESUME_TEXT}).status_code == 200
    assert client.post(f"{API}/resume-intelligence/recommend-document", headers=h, json={"occupation": "Data Analyst", "purpose": "corporate"}).status_code == 200
    g1 = client.post(f"{API}/resume-intelligence/generate", headers=h, json={"resume_id": rid, "document_type": "professional"}).json()
    vid = g1["version"]["id"]
    assert client.post(f"{API}/resume-intelligence/validate", headers=h, json={"resume_id": rid, "version_id": vid}).status_code == 200
    assert client.get(f"{API}/resume-intelligence/history", headers=h).status_code == 200
    assert client.get(f"{API}/resumes/{rid}", headers=h).status_code == 200
    vers = client.get(f"{API}/resumes/{rid}/versions", headers=h).json()
    assert vers
    v = client.get(f"{API}/resumes/{rid}/versions/{vid}", headers=h).json()
    content = v["content"]
    content["skills"] = content["skills"] + ["Looker"]
    e = client.post(f"{API}/resumes/{rid}/versions/{vid}/edit", headers=h, json={"content": content, "template": "modern"})
    assert e.status_code == 201
    vid2 = e.json()["id"] if "id" in e.json() else e.json()["version"]["id"]
    cmp = client.get(f"{API}/resumes/{rid}/compare?a={vid}&b={vid2}", headers=h)
    assert cmp.status_code == 200 and "Looker" in str(cmp.json())
    assert client.post(f"{API}/resumes/{rid}/versions/{vid}/restore", headers=h).status_code == 201
    cl = client.post(f"{API}/resume-intelligence/cover-letter", headers=h,
                     json={"resume_id": rid, "company": "Initech", "job_description": "We need a data analyst with SQL and Tableau to build dashboards."})
    assert cl.status_code in (200, 402) and (cl.status_code == 402 or len(cl.json()["letter"]) > 50)

    # assistant
    c = client.post(f"{API}/assistant/conversations", headers=h, json={})
    assert c.status_code == 201
    m = client.post(f"{API}/assistant/messages", headers=h, json={"conversation_id": c.json()["id"], "message": "What should I do next in my search?"})
    assert m.status_code == 200, m.text
    assert client.get(f"{API}/assistant/conversations", headers=h).json()
    assert len(client.get(f"{API}/assistant/conversations/{c.json()['id']}", headers=h).json()["messages"]) >= 2
    assert client.delete(f"{API}/assistant/conversations/{c.json()['id']}", headers=h).status_code == 200
    assert client.delete(f"{API}/resumes/{rid}", headers=h).status_code == 200


def test_admin_everything(client):
    ids = _seed_jobs(3)
    u = register(client, "cust@test.io", "Cus Tomer")
    admin = make_admin(client)
    uid = client.get(f"{API}/auth/me", headers=u).json()["id"]
    assert client.get(f"{API}/admin/metrics", headers=admin).status_code == 200
    users = client.get(f"{API}/admin/users?q=cust", headers=admin).json()
    assert users[0]["email"] == "cust@test.io"
    assert client.patch(f"{API}/admin/users/{uid}", headers=admin, json={"action": "grant_plan", "plan": "plus"}).status_code == 200
    assert client.get(f"{API}/billing/subscription", headers=u).json()["plan"]["slug"] == "plus"
    assert client.patch(f"{API}/admin/users/{uid}", headers=admin, json={"action": "suspend"}).status_code == 200
    assert client.get(f"{API}/auth/me", headers=u).status_code in (401, 403)
    assert client.patch(f"{API}/admin/users/{uid}", headers=admin, json={"action": "restore"}).status_code == 200

    plans = client.get(f"{API}/admin/plans", headers=admin).json()
    assert len(plans) == 4
    assert client.patch(f"{API}/admin/plans/plus", headers=admin, json={"price_month": 21, "features": ["A", "B"]}).status_code == 200
    assert client.get(f"{API}/billing/plans").json()["plans"][1]["price_month"] == 21

    src = client.post(f"{API}/admin/job-sources", headers=admin, json={"kind": "remotive", "name": "Remotive test", "config": {}})
    assert src.status_code == 201, src.text
    assert any(s["name"] == "Remotive test" for s in client.get(f"{API}/admin/job-sources", headers=admin).json()["sources"])
    assert client.patch(f"{API}/admin/job-sources/{src.json()['id']}", headers=admin, json={"is_active": False}).status_code == 200
    assert client.delete(f"{API}/admin/job-sources/{src.json()['id']}", headers=admin).status_code == 200

    gl = client.post(f"{API}/admin/knowledge/guidelines", headers=admin, json={"occupation": "Nurse", "document_type": "professional", "category": "best_practice", "text": "Lead with licenses and clinical rotations."})
    assert gl.status_code == 201, gl.text
    assert client.patch(f"{API}/admin/knowledge/guidelines/{gl.json()['id']}", headers=admin, json={"occupation": "Nurse", "document_type": "professional", "category": "best_practice", "text": "Licenses first, then clinical rotations."}).status_code == 200
    assert client.get(f"{API}/admin/knowledge/guidelines", headers=admin).json()

    assert client.get(f"{API}/admin/ai-usage", headers=admin).status_code == 200
    assert client.get(f"{API}/admin/audit-logs", headers=admin).json()
    assert client.get(f"{API}/admin/payments", headers=admin).status_code == 200

    # job moderation hides a job from the public board
    assert client.patch(f"{API}/admin/jobs/{ids[0]}", headers=admin, json={"is_active": False, "title": "Edited"}).status_code == 200
    assert client.get(f"{API}/admin/jobs?active=hidden", headers=admin).json()["total"] == 1
    assert ids[0] not in [j["id"] for j in client.get(f"{API}/jobs").json()["items"]]

    # CRM note delete; every export dataset in both formats
    n = client.post(f"{API}/admin/crm/customers/{uid}/notes", headers=admin, json={"body": "Called", "kind": "call"}).json()
    assert client.delete(f"{API}/admin/crm/notes/{n['id']}", headers=admin).status_code == 200
    for ds in ["customers", "payments", "subscriptions", "applications", "jobs", "notes", "ai_calls", "audit_logs", "plans"]:
        for fmt in ("csv", "xlsx"):
            r = client.get(f"{API}/admin/export/{ds}?format={fmt}", headers=admin)
            assert r.status_code == 200 and len(r.content) > 20, (ds, fmt)
    assert client.get(f"{API}/admin/content", headers=admin).json()["content"]["pricing_faq"]["items"]
    # regular users can't reach any admin endpoint
    for path in ["/admin/users", "/admin/crm/customers", "/admin/export/customers", "/admin/jobs", "/admin/content"]:
        assert client.get(f"{API}{path}", headers=u).status_code == 403


def test_health_and_docs(client):
    assert client.get("/health").json()["ok"] is True
    assert client.get("/api/openapi.json").status_code == 200
