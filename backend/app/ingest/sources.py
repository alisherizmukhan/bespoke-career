"""Job fetchers. Each takes the source config and returns normalized dicts.

Access policy: only official/public job APIs, publisher feeds, and pages that robots.txt allows.
Indeed, ZipRecruiter, Monster, SimplyHired and Wellfound sit behind bot protection with no public API,
and LinkedIn scraping is excluded by the product spec (9.6) — the job board links out to them instead.
"""
import html
import re
import time
from datetime import datetime, timezone
from urllib.parse import urlencode

import httpx
from bs4 import BeautifulSoup

from ..config import get_settings
from . import parse

settings = get_settings()


def _client(**headers) -> httpx.Client:
    h = {"User-Agent": settings.ingest_user_agent, "Accept-Language": "en-US,en;q=0.8"}
    h.update(headers)
    return httpx.Client(timeout=30, follow_redirects=True, headers=h)


def _dt(v) -> datetime | None:
    if v in (None, "", 0):
        return None
    try:
        if isinstance(v, (int, float)) or (isinstance(v, str) and v.isdigit()):
            n = float(v)
            return datetime.fromtimestamp(n / 1000 if n > 1e11 else n, tz=timezone.utc)
        d = datetime.fromisoformat(str(v).replace("Z", "+00:00"))
        return d if d.tzinfo else d.replace(tzinfo=timezone.utc)
    except (ValueError, OSError):
        return None


def _fix(s: str | None) -> str | None:
    """Undo double-encoded UTF-8 ("SothebyÃ¢Â€Â™s") and HTML entities ("&#038;")."""
    if not s:
        return s
    if re.search(r"[ÂÃâ][-¿-¿‘-›]", s):
        try:
            s = s.encode("cp1252", errors="ignore").decode("utf-8")
        except UnicodeDecodeError:
            try:
                s = s.encode("latin-1", errors="ignore").decode("utf-8")
            except UnicodeDecodeError:
                pass
    return html.unescape(s).strip()


def _job(**kw) -> dict:
    title = _fix(kw.get("title") or "") or ""
    kw["company"] = _fix(kw.get("company"))
    desc = kw.get("description")
    loc = kw.get("location")
    base = {
        "title": title[:300], "company": (kw.get("company") or "").strip() or None, "location": (loc or None) and loc[:160],
        "salary_min": None, "salary_max": None, "currency": None, "salary_period": None, "salary_text": None,
        "company_logo": kw.get("company_logo") or None,
        "employment_type": parse.detect_employment(kw.get("employment_hint") or title),
        "work_format": kw.get("work_format") or parse.detect_work_format(title, loc),
        "seniority": parse.detect_seniority(title) or kw.get("seniority"),
        "category": kw.get("category") or parse.detect_category(title, desc or ""),
        "description": desc, "tags": kw.get("tags") or [], "contacts": kw.get("contacts") or [],
        "published_at": kw.get("published_at"), "external_id": kw["external_id"], "url": kw["url"],
    }
    sal = kw.get("salary") or {}
    if not sal and kw.get("salary_text"):
        sal = parse.parse_salary(kw["salary_text"])
    if not sal:
        sal = parse.parse_salary(title) or parse.parse_salary((desc or "")[:3000])
    base.update({k: v for k, v in sal.items() if v is not None})
    yearly = parse.annualize(base["salary_max"] or base["salary_min"], base["salary_period"])
    if yearly and (yearly > 1_500_000 or yearly < 8_000):  # obviously broken salary data from the source
        base.update(salary_min=None, salary_max=None, currency=None, salary_period=None, salary_text=None)
    if kw.get("source_label"):
        base["source_label"] = kw["source_label"]
    return base


# ------------------------------------------------------------------ Talent.com (aggregator; /jobs allowed by robots.txt)


def fetch_talent(cfg: dict) -> list[dict]:
    pages = max(1, min(int(cfg.get("pages", 2)), 5))
    out, seen = [], set()
    with _client() as c:
        for p in range(1, pages + 1):
            params = {"k": cfg.get("k", ""), "l": cfg.get("l", "")}
            if p > 1:
                params["p"] = p
            r = c.get(f"https://www.talent.com/jobs?{urlencode(params)}")
            r.raise_for_status()
            soup = BeautifulSoup(r.text, "lxml")
            cards = soup.select("div[data-new-id]")
            if not cards:
                break
            for card in cards:
                jid = card["data-new-id"]
                if jid in seen:
                    continue
                seen.add(jid)
                title = card.select_one("h2")
                if not title:
                    continue
                comp = card.select_one("[class*=JobCard_company]")
                loc = card.select_one("[class*=JobCard_location]")
                snip = card.select_one("[class*=JobCard_snippet]")
                tm = card.select_one("time[datetime]")
                logo = card.select_one("img[class*=logo]")
                snippet = snip.get_text(" ", strip=True).replace("Show more", "").strip() if snip else None
                card_text = card.get_text(" ", strip=True)
                out.append(_job(
                    external_id=f"talent:{jid}", url=f"https://www.talent.com/view?id={jid}",
                    title=title.get_text(strip=True), company=comp.get_text(strip=True) if comp else None,
                    location=loc.get_text(strip=True) if loc else None, description=snippet,
                    salary=parse.parse_salary(card_text), employment_hint=card_text,
                    published_at=_dt(tm["datetime"]) if tm else None,
                    company_logo=logo["src"] if logo and logo.get("src", "").startswith("http") else None))
            time.sleep(settings.ingest_request_delay_s)
    return out


# ------------------------------------------------------------------ Company boards (official public APIs)


def fetch_greenhouse(cfg: dict) -> list[dict]:
    board = cfg["board"]
    with _client() as c:
        r = c.get(f"https://boards-api.greenhouse.io/v1/boards/{board}/jobs", params={"content": "true"})
        r.raise_for_status()
        data = r.json()
    out = []
    for j in data.get("jobs", []):
        loc = (j.get("location") or {}).get("name")
        if cfg.get("us_only", True) and not parse.is_us_location(loc):
            continue
        desc = parse.html_to_text(j.get("content"))
        dept = ", ".join(d["name"] for d in j.get("departments") or [] if d.get("name"))
        out.append(_job(external_id=f"gh:{board}:{j['id']}", url=j.get("absolute_url"), title=j.get("title"),
                        company=j.get("company_name") or cfg.get("company") or board.title(), location=loc,
                        description=desc, published_at=_dt(j.get("first_published") or j.get("updated_at")),
                        tags=[dept] if dept else [], employment_hint=f"{j.get('title')} {desc[:400] if desc else ''}"))
    return out


def fetch_ashby(cfg: dict) -> list[dict]:
    board = cfg["board"]
    with _client() as c:
        r = c.get(f"https://api.ashbyhq.com/posting-api/job-board/{board}", params={"includeCompensation": "true"})
        r.raise_for_status()
        data = r.json()
    out = []
    for j in data.get("jobs", []):
        if j.get("isListed") is False:
            continue
        country = (((j.get("address") or {}).get("postalAddress") or {}).get("addressCountry") or "")
        locs = [j.get("location") or ""] + [s.get("location", "") for s in j.get("secondaryLocations") or []]
        us = country in ("USA", "United States", "US") or any(parse.is_us_location(l) for l in locs)
        if cfg.get("us_only", True) and not us:
            continue
        comp = (j.get("compensation") or {}).get("scrapeableCompensationSalarySummary") or \
               (j.get("compensation") or {}).get("compensationTierSummary")
        wt = (j.get("workplaceType") or "").lower()
        out.append(_job(external_id=f"ashby:{board}:{j['id']}", url=j.get("jobUrl"), title=j.get("title"),
                        company=cfg.get("company") or board.title(), location=j.get("location"),
                        description=(j.get("descriptionPlain") or "")[:8000] or None,
                        salary=parse.parse_salary(comp) if comp else {}, published_at=_dt(j.get("publishedAt")),
                        work_format={"remote": "remote", "hybrid": "hybrid", "onsite": "onsite"}.get(wt),
                        employment_hint=j.get("employmentType"), tags=[t for t in [j.get("department"), j.get("team")] if t]))
    return out


def fetch_lever(cfg: dict) -> list[dict]:
    co = cfg["company"]
    with _client() as c:
        r = c.get(f"https://api.lever.co/v0/postings/{co}", params={"mode": "json"})
        r.raise_for_status()
        data = r.json()
    out = []
    for j in data if isinstance(data, list) else []:
        cats = j.get("categories") or {}
        loc = cats.get("location") or ", ".join(cats.get("allLocations") or [])
        if cfg.get("us_only", True) and j.get("country") != "US" and not parse.is_us_location(loc):
            continue
        sr = j.get("salaryRange") or {}
        sal = {}
        if sr.get("min"):
            sal = {"salary_min": sr.get("min"), "salary_max": sr.get("max"), "currency": sr.get("currency"),
                   "salary_period": {"per-year-salary": "year", "per-hour-wage": "hour", "per-month-salary": "month"}.get(sr.get("interval"))}
        else:
            sal = parse.parse_salary(j.get("additionalPlain") or "")
        desc = "\n\n".join(x for x in [j.get("descriptionPlain"), *[f"{l.get('text')}\n{parse.html_to_text(l.get('content')) or ''}"
                                                                       for l in j.get("lists") or []]] if x)
        out.append(_job(external_id=f"lever:{co}:{j['id']}", url=j.get("hostedUrl"), title=j.get("text"),
                        company=cfg.get("company_name") or co.title(), location=loc, description=desc[:8000] or None,
                        salary=sal, published_at=_dt(j.get("createdAt")), employment_hint=cats.get("commitment"),
                        work_format={"remote": "remote", "hybrid": "hybrid", "on-site": "onsite"}.get(j.get("workplaceType")),
                        tags=[t for t in [cats.get("department"), cats.get("team")] if t]))
    return out


# ------------------------------------------------------------------ Remote job APIs (attribution required)


def _us_remote(loc: str | None) -> bool:
    return parse.is_us_location(loc, allow_unspecified_remote=True)


def fetch_remotive(cfg: dict) -> list[dict]:
    params = {k: cfg[k] for k in ("category", "search") if cfg.get(k)}
    with _client() as c:
        r = c.get("https://remotive.com/api/remote-jobs", params=params)
        r.raise_for_status()
        jobs = r.json().get("jobs", [])
    out = []
    for j in jobs:
        loc = j.get("candidate_required_location")
        if not _us_remote(loc):
            continue
        out.append(_job(external_id=f"remotive:{j['id']}", url=j.get("url"), title=j.get("title"),
                        company=j.get("company_name"), location=f"Remote ({loc})" if loc else "Remote",
                        description=parse.html_to_text(j.get("description")), salary_text=j.get("salary"),
                        published_at=_dt(j.get("publication_date")), work_format="remote",
                        employment_hint=j.get("job_type"), tags=(j.get("tags") or [])[:8],
                        company_logo=j.get("company_logo_url") or j.get("company_logo")))
    return out


def fetch_remoteok(cfg: dict) -> list[dict]:
    with _client() as c:
        r = c.get("https://remoteok.com/api")
        r.raise_for_status()
        data = r.json()
    out = []
    for j in data[1:] if isinstance(data, list) else []:
        loc = j.get("location") or ""
        if not _us_remote(loc):
            continue
        sal = {}
        if int(j.get("salary_min") or 0) > 0:
            sal = {"salary_min": float(j["salary_min"]), "salary_max": float(j.get("salary_max") or 0) or None,
                   "currency": "USD", "salary_period": "year"}
        out.append(_job(external_id=f"remoteok:{j['id']}", url=j.get("url"), title=html.unescape(j.get("position") or ""),
                        company=j.get("company"), location=f"Remote ({loc})" if loc else "Remote",
                        description=parse.html_to_text(j.get("description")), salary=sal,
                        published_at=_dt(j.get("date")), work_format="remote", tags=(j.get("tags") or [])[:8],
                        company_logo=j.get("company_logo") or j.get("logo")))
    return out


def fetch_himalayas(cfg: dict) -> list[dict]:
    pages = max(1, min(int(cfg.get("pages", 5)), 20))
    out = []
    with _client() as c:
        for p in range(pages):
            r = c.get("https://himalayas.app/jobs/api", params={"limit": 20, "offset": p * 20})
            r.raise_for_status()
            jobs = r.json().get("jobs", [])
            if not jobs:
                break
            for j in jobs:
                restr = j.get("locationRestrictions") or []
                if restr and "United States" not in restr:
                    continue
                sal = {}
                if j.get("minSalary"):
                    sal = {"salary_min": float(j["minSalary"]), "salary_max": float(j["maxSalary"]) if j.get("maxSalary") else None,
                           "currency": j.get("currency") or "USD",
                           "salary_period": {"annual": "year", "hourly": "hour", "monthly": "month"}.get(j.get("salaryPeriod"), "year")}
                sen = (j.get("seniority") or [None])[0]
                out.append(_job(external_id=f"himalayas:{j.get('guid')}", url=j.get("applicationLink") or j.get("guid"),
                                title=j.get("title"), company=j.get("companyName"),
                                location="Remote (US)" if restr else "Remote (Worldwide)",
                                description=parse.html_to_text(j.get("description")), salary=sal,
                                published_at=_dt(j.get("pubDate")), work_format="remote",
                                employment_hint=j.get("employmentType"), company_logo=j.get("companyLogo"),
                                seniority=parse.detect_seniority(sen) if sen else None,
                                tags=(j.get("parentCategories") or [])[:4]))
            time.sleep(settings.ingest_request_delay_s)
    return out


def fetch_jobicy(cfg: dict) -> list[dict]:
    with _client() as c:
        r = c.get("https://jobicy.com/api/v2/remote-jobs", params={"count": 50, "geo": cfg.get("geo", "usa"),
                                                                    **({"industry": cfg["industry"]} if cfg.get("industry") else {})})
        r.raise_for_status()
        jobs = r.json().get("jobs", [])
    out = []
    for j in jobs:
        sal = {}
        if j.get("salaryMin") or j.get("annualSalaryMin"):
            sal = {"salary_min": float(j.get("salaryMin") or j.get("annualSalaryMin")),
                   "salary_max": float(j.get("salaryMax") or j.get("annualSalaryMax") or 0) or None,
                   "currency": j.get("salaryCurrency") or "USD",
                   "salary_period": {"yearly": "year", "hourly": "hour", "monthly": "month"}.get(j.get("salaryPeriod"), "year")}
        out.append(_job(external_id=f"jobicy:{j['id']}", url=j.get("url"), title=html.unescape(j.get("jobTitle") or ""),
                        company=j.get("companyName"), location=f"Remote ({j.get('jobGeo') or 'USA'})",
                        description=parse.html_to_text(j.get("jobDescription")), salary=sal,
                        published_at=_dt(j.get("pubDate")), work_format="remote",
                        employment_hint=" ".join(j.get("jobType") or []), company_logo=j.get("companyLogo"),
                        seniority=parse.detect_seniority(j.get("jobLevel")), tags=(j.get("jobIndustry") or [])[:4]))
    return out


# ------------------------------------------------------------------ Keyed public APIs (free registration)


def fetch_adzuna(cfg: dict) -> list[dict]:
    if not (settings.adzuna_app_id and settings.adzuna_app_key):
        raise RuntimeError("Set ADZUNA_APP_ID and ADZUNA_APP_KEY (free at developer.adzuna.com) to enable this source.")
    pages = max(1, min(int(cfg.get("pages", 2)), 10))
    out = []
    with _client() as c:
        for p in range(1, pages + 1):
            r = c.get(f"https://api.adzuna.com/v1/api/jobs/us/search/{p}", params={
                "app_id": settings.adzuna_app_id, "app_key": settings.adzuna_app_key, "results_per_page": 50,
                "what": cfg.get("what", ""), "where": cfg.get("where", ""), "content-type": "application/json"})
            r.raise_for_status()
            res = r.json().get("results", [])
            if not res:
                break
            for j in res:
                sal = {}
                if j.get("salary_min"):
                    sal = {"salary_min": j["salary_min"], "salary_max": j.get("salary_max"), "currency": "USD",
                           "salary_period": parse.detect_period("", j["salary_min"]) or "year"}
                out.append(_job(external_id=f"adzuna:{j['id']}", url=j.get("redirect_url"), title=html.unescape(j.get("title") or ""),
                                company=(j.get("company") or {}).get("display_name"),
                                location=(j.get("location") or {}).get("display_name"),
                                description=parse.html_to_text(j.get("description")), salary=sal,
                                published_at=_dt(j.get("created")),
                                employment_hint=f"{j.get('contract_time') or ''} {j.get('contract_type') or ''}"))
            time.sleep(settings.ingest_request_delay_s)
    return out


def fetch_usajobs(cfg: dict) -> list[dict]:
    if not (settings.usajobs_api_key and settings.usajobs_email):
        raise RuntimeError("Set USAJOBS_API_KEY and USAJOBS_EMAIL (free at developer.usajobs.gov) to enable this source.")
    with _client(**{"Host": "data.usajobs.gov", "User-Agent": settings.usajobs_email,
                    "Authorization-Key": settings.usajobs_api_key}) as c:
        r = c.get("https://data.usajobs.gov/api/search", params={"Keyword": cfg.get("keyword", ""),
                                                                 "LocationName": cfg.get("location", ""),
                                                                 "ResultsPerPage": min(int(cfg.get("limit", 250)), 500)})
        r.raise_for_status()
        items = r.json().get("SearchResult", {}).get("SearchResultItems", [])
    out = []
    for it in items:
        d = it.get("MatchedObjectDescriptor", {})
        rem = (d.get("PositionRemuneration") or [{}])[0]
        sal = {}
        if rem.get("MinimumRange"):
            sal = {"salary_min": float(rem["MinimumRange"]), "salary_max": float(rem.get("MaximumRange") or 0) or None,
                   "currency": "USD", "salary_period": {"PA": "year", "PH": "hour", "PM": "month"}.get(rem.get("RateIntervalCode"), "year")}
        out.append(_job(external_id=f"usajobs:{d.get('PositionID')}", url=d.get("PositionURI"), title=d.get("PositionTitle"),
                        company=d.get("OrganizationName"), location=d.get("PositionLocationDisplay"),
                        description=((d.get("UserArea") or {}).get("Details") or {}).get("JobSummary"), salary=sal,
                        published_at=_dt(d.get("PublicationStartDate")),
                        employment_hint=" ".join(s.get("Name", "") for s in d.get("PositionSchedule") or [])))
    return out


# ------------------------------------------------------------------ Telegram public channels (t.me/s preview)


def fetch_telegram(cfg: dict) -> list[dict]:
    channel = re.sub(r"^(https?://)?t\.me/(s/)?|^@", "", str(cfg.get("channel", "")).strip()).strip("/")
    if not re.fullmatch(r"[A-Za-z][\w]{3,31}", channel):
        raise ValueError(f"Invalid channel username: {cfg.get('channel')}")
    pages = max(1, min(int(cfg.get("pages", 2)), 10))
    out, before = [], None
    with _client() as c:
        for _ in range(pages):
            r = c.get(f"https://t.me/s/{channel}" + (f"?before={before}" if before else ""))
            r.raise_for_status()
            soup = BeautifulSoup(r.text, "lxml")
            msgs = soup.select(".tgme_widget_message[data-post]")
            if not msgs:
                if before is None:
                    raise ValueError(f"Channel @{channel} has no public preview")
                break
            label = soup.select_one(".tgme_channel_info_header_title")
            label = label.get_text(strip=True) if label else f"@{channel}"
            ids = []
            for m in msgs:
                post = m["data-post"]
                pid = post.split("/")[-1]
                if pid.isdigit():
                    ids.append(int(pid))
                body = m.select_one(".tgme_widget_message_text")
                if not body:
                    continue
                for br in body.find_all("br"):
                    br.replace_with("\n")
                text = html.unescape(body.get_text()).strip()
                if not parse.looks_like_job(text):
                    continue
                title = parse.extract_title(text)
                if not title:
                    continue
                t = m.select_one("time[datetime]")
                out.append(_job(external_id=f"tg:{post}", url=f"https://t.me/{post}", title=title,
                                company=parse.extract_company(text), location=cfg.get("default_location"),
                                description=text[:6000], published_at=_dt(t["datetime"]) if t else None,
                                employment_hint=text[:800], work_format=parse.detect_work_format(text[:800]),
                                tags=parse.extract_tags(text), contacts=parse.extract_contacts(text), source_label=label))
            if not ids or min(ids) <= 1:
                break
            before = min(ids)
            time.sleep(settings.ingest_request_delay_s)
    return out


FETCHERS = {
    "talent": fetch_talent,
    "greenhouse": fetch_greenhouse,
    "ashby": fetch_ashby,
    "lever": fetch_lever,
    "remotive": fetch_remotive,
    "remoteok": fetch_remoteok,
    "himalayas": fetch_himalayas,
    "jobicy": fetch_jobicy,
    "adzuna": fetch_adzuna,
    "usajobs": fetch_usajobs,
    "telegram": fetch_telegram,
}

# Shown on every job card and on the job board footer, as these providers' terms require.
ATTRIBUTION = {
    "talent": "Talent.com", "greenhouse": "Greenhouse", "ashby": "Ashby", "lever": "Lever",
    "remotive": "Remotive", "remoteok": "Remote OK", "himalayas": "Himalayas", "jobicy": "Jobicy",
    "adzuna": "Adzuna", "usajobs": "USAJOBS", "telegram": "Telegram",
}
