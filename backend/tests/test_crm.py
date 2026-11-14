import io

from openpyxl import load_workbook

from .conftest import API, make_admin, register


def test_crm_lifecycle_notes_and_export(client):
    user = register(client, "lead@test.io", "Lea Dunn")
    admin = make_admin(client)
    assert client.get(f"{API}/admin/crm/overview", headers=user).status_code == 403

    # Paying yearly customer
    assert client.post(f"{API}/billing/checkout", json={"plan": "pro", "interval": "year"}, headers=user).status_code == 200
    rows = client.get(f"{API}/admin/crm/customers?stage=paying", headers=admin).json()["items"]
    lea = next(r for r in rows if r["email"] == "lead@test.io")
    assert lea["mrr"] == 24 and lea["lifetime_revenue"] == 288 and lea["interval"] == "year"

    ov = client.get(f"{API}/admin/crm/overview", headers=admin).json()
    assert ov["paying"] == 1 and ov["arr"] == 288 and ov["yearly_share"] == 100

    # Tags, manual stage, follow-up, notes and tasks
    uid = lea["id"]
    assert client.patch(f"{API}/admin/crm/customers/{uid}", json={"tags": ["beta", "referral"], "stage": "vip"}, headers=admin).status_code == 200
    assert client.post(f"{API}/admin/crm/customers/{uid}/notes", json={"kind": "task", "body": "Call about team plan",
                                                                     "due_at": "2026-01-01T10:00:00Z"}, headers=admin).status_code == 201
    d = client.get(f"{API}/admin/crm/customers/{uid}", headers=admin).json()
    assert d["stage"] == "vip" and d["stage_auto"] == "paying" and d["tags"] == ["beta", "referral"]
    assert d["notes"][0]["kind"] == "task" and d["payments"][0]["amount"] == 288
    tasks = client.get(f"{API}/admin/crm/tasks", headers=admin).json()
    assert len(tasks) == 1 and client.get(f"{API}/admin/crm/overview", headers=admin).json()["tasks_overdue"] == 1
    client.patch(f"{API}/admin/crm/notes/{tasks[0]['id']}", json={"done": True}, headers=admin)
    assert client.get(f"{API}/admin/crm/tasks", headers=admin).json() == []
    assert client.get(f"{API}/admin/crm/customers?tag=referral", headers=admin).json()["total"] == 1

    # Exports
    r = client.get(f"{API}/admin/export/customers?format=csv", headers=admin)
    assert r.status_code == 200 and "lead@test.io" in r.text and r.text.startswith("﻿id,email")
    r = client.get(f"{API}/admin/export/payments?format=xlsx", headers=admin)
    ws = load_workbook(io.BytesIO(r.content)).active
    assert ws["A1"].value == "created_at" and ws.max_row == 2
    assert client.get(f"{API}/admin/export/secrets", headers=admin).status_code == 404


def test_content_and_job_moderation(client):
    admin = make_admin(client)
    assert client.get(f"{API}/content").json()["announcement"]["active"] is False
    r = client.put(f"{API}/admin/content/announcement", json={"active": True, "text": "Yearly plans are 38% off", "evil": 1}, headers=admin)
    assert r.status_code == 200
    c = client.get(f"{API}/content").json()["announcement"]
    assert c["active"] is True and c["text"] == "Yearly plans are 38% off" and "evil" not in c
    client.delete(f"{API}/admin/content/announcement", headers=admin)
    assert client.get(f"{API}/content").json()["announcement"]["active"] is False
    assert client.get(f"{API}/admin/jobs", headers=admin).json()["total"] == 0


def test_cancel_and_switch_to_yearly(client):
    user = register(client)
    client.post(f"{API}/billing/checkout", json={"plan": "plus", "interval": "month"}, headers=user)
    assert client.post(f"{API}/billing/change-plan", json={"plan": "plus", "interval": "month"}, headers=user).status_code == 409
    assert client.post(f"{API}/billing/change-plan", json={"plan": "plus", "interval": "year"}, headers=user).status_code == 200
    s = client.get(f"{API}/billing/subscription", headers=user).json()["subscription"]
    assert s["interval"] == "year"
    assert [h["amount"] for h in client.get(f"{API}/billing/history", headers=user).json()] == [144, 19]
