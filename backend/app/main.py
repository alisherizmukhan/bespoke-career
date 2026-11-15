import logging
import threading
import time

from fastapi import APIRouter, FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .config import get_settings
from .routers import admin, applications, auth, billing, crm, jobs, misc, profile, resumes, salary_assistant

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
log = logging.getLogger("bespoke")
settings = get_settings()

app = FastAPI(title="Bespoke API", version="1.0.0",
              description="Bespoke — AI-powered Career Intelligence Platform. Versioned REST API under /api/v1.",
              docs_url=None if settings.env == "production" else "/api/docs",
              openapi_url=None if settings.env == "production" else "/api/openapi.json", redoc_url=None)
app.add_middleware(CORSMiddleware, allow_origins=settings.cors_list, allow_credentials=False,
                   allow_methods=["*"], allow_headers=["*"], expose_headers=["Content-Disposition"])


@app.middleware("http")
async def security_headers(request: Request, call_next):
    resp = await call_next(request)
    resp.headers.setdefault("X-Content-Type-Options", "nosniff")
    resp.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    resp.headers.setdefault("X-Frame-Options", "DENY")
    if not request.url.path.startswith(("/api/docs", "/api/openapi")):
        resp.headers.setdefault("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'")
    resp.headers.setdefault("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
    if request.url.path.startswith(("/api/v1/auth", "/api/v1/account", "/api/v1/admin", "/api/v1/billing")):
        resp.headers.setdefault("Cache-Control", "no-store")
    if settings.env == "production":
        resp.headers.setdefault("Strict-Transport-Security", "max-age=31536000")
    return resp


@app.exception_handler(RequestValidationError)
async def validation_handler(request: Request, exc: RequestValidationError):
    errors = []
    for e in exc.errors():
        loc = [str(p) for p in e.get("loc", []) if p not in ("body", "query", "path", "form")]
        errors.append({"field": ".".join(loc), "message": e.get("msg", "Invalid value").removeprefix("Value error, ")})
    first = errors[0] if errors else {"field": "", "message": "Invalid request"}
    label = first["field"].split(".")[-1].replace("_", " ").capitalize()
    return JSONResponse(status_code=422, content={"detail": {"code": "validation_error",
                        "message": f"{label}: {first['message']}" if label else first["message"], "errors": errors}})


@app.get("/health")
def health():
    return {"ok": True, "ai": settings.ai_enabled}


api = APIRouter(prefix="/api/v1")
for r in (auth, profile, jobs, applications, resumes, salary_assistant, billing, misc, admin, crm):
    api.include_router(r.router)
app.include_router(api)


def _scheduler():
    from .ingest.runner import run_all
    time.sleep(30)
    while True:
        try:
            run_all()  # each source respects its own min interval
        except Exception:  # noqa: BLE001
            log.exception("scheduled ingestion failed")
        time.sleep(max(5, settings.ingest_interval_minutes) * 60)


@app.on_event("startup")
def start_scheduler():
    if settings.ingest_enabled:
        threading.Thread(target=_scheduler, daemon=True, name="ingest").start()
        log.info("job ingestion scheduler started (every %s min)", settings.ingest_interval_minutes)
