# Bespoke — AI-Powered Career Intelligence Platform

*Your career, thoughtfully built.* Bespoke (spec: *Bespoke PRD v1*) connects a shared career profile, Resume
Intelligence, Salary Intelligence, a live US job board, a Job Tracker and an AI Career Assistant. The visual
language follows the CareNear brand book (violet / lavender / white / ink, Inter + a bold geometric display face).

```
carenear/
├── backend/    FastAPI · SQLAlchemy · Alembic · PostgreSQL — REST API under /api/v1
└── frontend/   Next.js 15 · React 19 · TypeScript · Tailwind · TanStack Query · React Hook Form + Zod
```

## Phase 1 (Core MVP) — what's implemented

| Area | Highlights |
| --- | --- |
| Auth & onboarding | Email/password, email verification, password reset, sessions (JWT), 4-step onboarding, 5 profile types, account deletion & data export |
| Career profile | Shared profile + skills used by every module; completeness score |
| Job board | ~6,000 live US jobs ingested hourly; search, filters (category, level, type, salary, source, remote, recency), saved jobs, “track this job”, outbound search links to Indeed / LinkedIn / ZipRecruiter / Monster / SimplyHired / Wellfound |
| Resume Intelligence | PDF/DOCX upload → parsing → **user verification** → profession-aware generation (12 document types) → ATS analysis vs. a job description → validation (completeness, **unsupported-claim detection**, grammar, job alignment) → versions (edit/restore/compare) → PDF/DOCX export (3 templates) → cover letters |
| Salary Intelligence | Market research (min/p25/median/mean/p75/max, by level, sources, sample size, window, limitations), personal estimate with factors and confidence, growth plan (skill premiums from data), negotiation assistant |
| Job Tracker | Kanban (drag & drop) / table / list, 13-stage pipeline + custom statuses, interviews, reminders, history, statistics |
| AI Career Assistant | Answers grounded in the user's own data only (profile, resumes, applications, interviews, reminders, salary, saved jobs, matching jobs) |
| Subscriptions | Free / Plus $19 / Pro $39 / Family $59 (monthly & yearly), central entitlement service with monthly limits, upgrades/cancel/renewal — **test mode** (no real charges) |
| Admin | Metrics (DAU/MAU, MRR/ARR/ARPA, conversion), users (suspend/restore/grant plan), job sources (status, errors, run now, add sources), plans & limits editor, knowledge base (versioned guidelines with source/confidence/verification date), AI usage, audit log |

Phases 2–4 (voice interview coach, LinkedIn growth, roadmap, student & family features) are scoped in the PRD and
not part of this build; the data model and plan limits already reserve their entitlements.

## Job ingestion (US)

Runs inside the API process every `INGEST_INTERVAL_MINUTES`; each source has its own minimum interval. Sources:

| Source | Access |
| --- | --- |
| Greenhouse, Ashby, Lever company boards (Stripe, OpenAI, Databricks, Airbnb, Palantir, Ramp, …) | Official public job-board APIs, US locations only |
| Talent.com (aggregator) | Public search pages (`/jobs`, allowed by robots.txt), polite rate limits |
| Remotive, Remote OK, Himalayas, Jobicy | Public remote-job APIs (attribution shown on every listing) |
| Adzuna, USAJOBS | Connectors ready; enable after adding free API keys |
| Telegram | Any public channel via its `t.me/s/<channel>` preview; ads, digests and job-seeker posts are filtered out |

**Not scraped:** Indeed, ZipRecruiter, Monster, SimplyHired and Wellfound sit behind bot protection and offer no
public API; LinkedIn scraping is excluded by the PRD (§9.6). The job board links out to them with the user's search.

## AI

Provider abstraction in `backend/app/ai/provider.py` — OpenAI by default (Anthropic supported via
`AI_PROVIDER=anthropic`). Two tiers: `OPENAI_MODEL_FAST` (default `gpt-5.4-mini`) for everyday assistant answers,
resume parsing and explanations; `OPENAI_MODEL` (default `gpt-5.5`) for resume generation, ATS advice, cover
letters, negotiation and complex assistant questions. Structured outputs are validated with Pydantic; salary
numbers always come from data, never from the model. Every call logs metadata only (task, prompt version, model,
tokens, latency). Without a key, every feature falls back to deterministic logic. Users can switch AI processing
off in Settings.

## Local development

```bash
cd backend
python -m venv .venv && .venv/Scripts/pip install -r requirements.txt   # .venv/bin/pip on macOS/Linux
cp .env.example .env            # set DATABASE_URL=sqlite:///./dev.db for a quick start
alembic upgrade head && python -m app.seed
python -m app.ingest.runner     # first job import (~3 min)
uvicorn app.main:app --reload --port 8000
```

```bash
cd frontend
npm install
NEXT_PUBLIC_API_URL=http://localhost:8000 npm run dev
```

API docs: `http://localhost:8000/api/docs` (OpenAPI at `/api/openapi.json`).

Demo account (when `SEED_DEMO_DATA=true`): `alex@demo.bespoke.app` / `DemoBespoke2026`. The admin account uses
`ADMIN_EMAIL` / `ADMIN_PASSWORD`.

## Tests

```bash
cd backend && .venv/Scripts/python -m pytest -q
```

Covers authentication, role separation, email verification, resume parsing (DOCX) → verify → generate → ATS →
PDF/DOCX export, file validation, unsupported-claim detection, entitlement limits & upgrades, application status
transitions and isolation, cross-user resume/file access with signed URLs, salary parsing/statistics, US location
filtering, data export and account deletion.

## Deployment (Railway)

Three services in one project: **Postgres**, **backend** (`/backend`, Dockerfile) and **frontend** (`/frontend`,
Dockerfile), plus an S3-compatible **bucket** for private uploads. Backend start command runs migrations and the
idempotent seed. Required backend variables: `DATABASE_URL`, `JWT_SECRET`, `ADMIN_PASSWORD`, `FRONTEND_URL`,
`PUBLIC_API_URL`, `CORS_ORIGINS`, `OPENAI_API_KEY`, `S3_*`. Frontend: `NEXT_PUBLIC_API_URL` (build time).
Secrets live only in Railway variables — never in the repository.

## Security & privacy notes

bcrypt password hashing, JWT sessions, per-route ownership checks (cross-user access returns 404), admin RBAC,
rate limiting on auth/AI/uploads, file-type sniffing and size limits, private storage with short-lived HMAC-signed
URLs, append-only audit log, data export and deletion. Billing runs in test mode until a payment provider is
connected. Compliance (GDPR, CCPA/CPRA, COPPA) requires legal review before launch — the app does not claim it.
