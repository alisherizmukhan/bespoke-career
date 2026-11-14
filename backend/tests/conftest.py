import os
import tempfile

_tmp = tempfile.mkdtemp()
os.environ.update({"DATABASE_URL": f"sqlite:///{_tmp}/test.db", "LOCAL_UPLOAD_DIR": f"{_tmp}/uploads",
                   "SEED_DEMO_DATA": "false", "INGEST_ENABLED": "false", "OPENAI_API_KEY": "", "ANTHROPIC_API_KEY": "",
                   "MAX_UPLOAD_MB": "1"})

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app import security  # noqa: E402
from app.db import Base, SessionLocal, engine  # noqa: E402
from app.entitlements import PLAN_DEFAULTS  # noqa: E402
from app.main import app  # noqa: E402
from app.models import Plan, User  # noqa: E402

API = "/api/v1"


@pytest.fixture(autouse=True)
def fresh_db():
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    db = SessionLocal()
    for d in PLAN_DEFAULTS:
        db.add(Plan(**d))
    db.commit()
    db.close()
    security._hits.clear()
    yield


@pytest.fixture
def client():
    return TestClient(app)


def register(client, email="a@test.io", name="Ann Lee"):
    r = client.post(f"{API}/auth/register", json={"full_name": name, "email": email, "password": "Passw0rd!x",
                                                  "accept_terms": True})
    assert r.status_code == 201, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def make_admin(client):
    db = SessionLocal()
    db.add(User(email="admin@test.io", password_hash=security.hash_password("Adm1nPass!"), role="admin"))
    db.commit()
    db.close()
    r = client.post(f"{API}/auth/login", json={"email": "admin@test.io", "password": "Adm1nPass!"})
    return {"Authorization": f"Bearer {r.json()['access_token']}"}
