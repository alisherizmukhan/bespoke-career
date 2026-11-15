"""Salary Intelligence. All numbers are computed from structured salary records (public job postings
with disclosed pay); the LLM only explains them."""
import re
import statistics
from datetime import timedelta

from pydantic import BaseModel, Field
from sqlalchemy import and_, or_, select
from sqlalchemy.orm import Session

from .ai import provider
from .ingest.parse import annualize, US_STATES
from .models import Job, UserProfile, UserSkill, utcnow

SENIORITY_ORDER = ["intern", "entry", "mid", "senior", "lead", "executive"]
STOP = {"and", "or", "the", "of", "a", "an", "for", "to", "in", "i", "ii", "iii", "sr", "jr"}


class SalaryExplanation(BaseModel):
    summary: str
    factors_up: list[str] = Field(default_factory=list)
    factors_down: list[str] = Field(default_factory=list)
    assumptions: list[str] = Field(default_factory=list)
    missing_information: list[str] = Field(default_factory=list)


def _pct(vals: list[float], p: float) -> float:
    if not vals:
        return 0
    s = sorted(vals)
    k = (len(s) - 1) * p
    f = int(k)
    c = min(f + 1, len(s) - 1)
    return s[f] + (s[c] - s[f]) * (k - f)


def _title_terms(q: str) -> list[str]:
    return [w for w in re.findall(r"[a-z0-9+#]+", (q or "").lower()) if w not in STOP and len(w) > 1]


def _location_clause(location: str | None):
    if not location:
        return None
    loc = location.strip()
    if loc.lower() in ("remote", "remote (us)", "us remote"):
        return or_(Job.work_format == "remote", Job.location.ilike("%remote%"))
    parts = [p.strip() for p in loc.split(",") if p.strip()]
    city = parts[0]
    clauses = [Job.location.ilike(f"%{city}%")]
    if len(parts) > 1 and parts[1].upper() in US_STATES:
        clauses.append(Job.location.ilike(f"%, {parts[1].upper()}%"))
        clauses.append(Job.location.ilike(f"%{US_STATES[parts[1].upper()]}%"))
    return or_(*clauses)


def _rows(db: Session, title: str, location: str | None, seniority: str | None, employment_type: str | None,
          days: int = 120) -> list[Job]:
    terms = _title_terms(title)
    stmt = select(Job).where(Job.salary_min.isnot(None), Job.currency == "USD", Job.is_duplicate.is_(False),
                             Job.fetched_at >= utcnow() - timedelta(days=days))
    for t in terms[:4]:
        stmt = stmt.where(Job.title.ilike(f"%{t}%"))
    lc = _location_clause(location)
    if lc is not None:
        stmt = stmt.where(lc)
    if seniority:
        stmt = stmt.where(Job.seniority == seniority)
    if employment_type:
        stmt = stmt.where(or_(Job.employment_type == employment_type, Job.employment_type.is_(None)))
    return db.scalars(stmt.limit(5000)).all()


def _yearly(j: Job) -> float | None:
    lo = annualize(j.salary_min, j.salary_period)
    hi = annualize(j.salary_max, j.salary_period) if j.salary_max else None
    v = (lo + hi) / 2 if lo and hi else (lo or hi)
    return v if v and 10_000 <= v <= 1_500_000 else None


def market_research(db: Session, title: str, location: str | None = None, seniority: str | None = None,
                    employment_type: str | None = None) -> dict:
    tried = []
    rows = []
    for loc, sen in [(location, seniority), (location, None), (None, seniority), (None, None)]:
        rows = _rows(db, title, loc, sen, employment_type)
        tried.append({"location": loc, "seniority": sen, "sample": len(rows)})
        if len([r for r in rows if _yearly(r)]) >= 5:
            location_used, seniority_used = loc, sen
            break
    else:
        location_used, seniority_used = None, None
    vals = [(r, _yearly(r)) for r in rows]
    vals = [(r, v) for r, v in vals if v]
    if len(vals) >= 8:
        # Drop obvious parsing outliers (e.g. a monthly figure read as yearly): outside 0.35x-3x of the median
        med = statistics.median(v for _, v in vals)
        vals = [(r, v) for r, v in vals if med * 0.35 <= v <= med * 3]
    nums = [v for _, v in vals]
    if not nums:
        return {"title": title, "location": location, "sample_size": 0, "currency": "USD",
                "message": "Not enough public salary data for this title yet. Try a broader title (e.g. “software engineer”).",
                "searches": tried}
    by_sen: dict[str, list[float]] = {}
    for r, v in vals:
        by_sen.setdefault(r.seniority or "unspecified", []).append(v)
    sources = sorted({r.source_name.split(" · ")[0] for r, _ in vals})[:12]
    dates = sorted(r.published_at or r.fetched_at for r, _ in vals)
    broadened = []
    if location and location_used is None:
        broadened.append(f"Not enough postings in {location}; showing national data.")
    if seniority and seniority_used is None:
        broadened.append(f"Not enough {seniority}-level postings; showing all levels.")
    return {
        "title": title, "location": location_used or "United States", "seniority": seniority_used, "currency": "USD",
        "period": "year", "compensation_type": "Base salary (posted pay ranges, midpoint)",
        "sample_size": len(nums),
        "stats": {"min": round(min(nums)), "p25": round(_pct(nums, .25)), "median": round(statistics.median(nums)),
                  "mean": round(statistics.mean(nums)), "p75": round(_pct(nums, .75)), "max": round(max(nums))},
        "by_seniority": {k: {"median": round(statistics.median(v)), "sample": len(v)}
                         for k, v in sorted(by_sen.items(), key=lambda kv: SENIORITY_ORDER.index(kv[0]) if kv[0] in SENIORITY_ORDER else 99)},
        "top_companies": [c for c, _ in _top([r.company for r, _ in vals if r.company], 8)],
        "sources": sources,
        "observation_window": {"from": dates[0].date().isoformat(), "to": dates[-1].date().isoformat()},
        "limitations": ["Based on public job postings that disclose pay (mostly states with pay-transparency laws).",
                        "Figures far outside the typical range for this role are left out as likely data errors.",
                        "Posted ranges show what employers advertise, not what people are paid.",
                        "Bonuses, equity and benefits are not included."] + broadened,
        "samples": [{"title": r.title, "company": r.company, "location": r.location, "yearly": round(v), "url": r.url}
                    for r, v in sorted(vals, key=lambda x: -x[1])[:0]],
        "_values": nums, "_rows": vals,
    }


def _top(items, n):
    counts = {}
    for i in items:
        counts[i] = counts.get(i, 0) + 1
    return sorted(counts.items(), key=lambda kv: -kv[1])[:n]


def skill_premiums(market: dict, skills: list[str]) -> list[dict]:
    rows = market.get("_rows") or []
    if len(rows) < 8:
        return []
    overall = statistics.median([v for _, v in rows])
    out = []
    for s in skills:
        k = s.lower()
        with_skill = [v for r, v in rows if k in ((r.description or "") + " " + r.title).lower()]
        if len(with_skill) >= 3:
            med = statistics.median(with_skill)
            out.append({"skill": s, "median_with_skill": round(med), "postings": len(with_skill),
                        "premium_pct": round(100 * (med - overall) / overall, 1)})
    return sorted(out, key=lambda x: -x["premium_pct"])


def public(market: dict) -> dict:
    return {k: v for k, v in market.items() if not k.startswith("_")}


def assess(db: Session, user, profile: UserProfile | None, title: str | None = None, location: str | None = None) -> dict:
    p = profile
    title = title or (p.target_title or p.current_title or p.occupation if p else None)
    if not title:
        return {"error": "Add your current or target job title to your profile first."}
    location = location if location is not None else (p.city if p and p.city else None)
    years = p.years_experience if p else None
    seniority = _seniority_from_years(years) if years is not None else (p.seniority if p else None)
    market = market_research(db, title, location, None)
    if not market.get("sample_size"):
        return {"title": title, "location": location, **public(market)}
    st = market["stats"]
    q = {"intern": .1, "entry": .25, "mid": .5, "senior": .7, "lead": .8, "executive": .9}.get(seniority or "", .5)
    point = _pct(market["_values"], q)
    skills = [s.skill for s in db.scalars(select(UserSkill).where(UserSkill.user_id == user.id))]
    prem = skill_premiums(market, skills)
    boost = sum(max(min(x["premium_pct"], 15), -10) for x in prem[:3]) / 100 * 0.5
    edu = " ".join(str(e) for e in (p.education or [])) .lower() if p else ""
    if re.search(r"master|mba|ph\.?d|doctor", edu):
        boost += 0.03
    point *= 1 + boost
    spread = (st["p75"] - st["p25"]) / 2 or point * 0.15
    low, high = max(st["min"], point - spread * 0.6), min(st["max"], point + spread * 0.6)
    n = market["sample_size"]
    confidence = "high" if n >= 40 and market["location"] != "United States" else ("medium" if n >= 12 else "low")
    missing = []
    if years is None:
        missing.append("Years of experience")
    if not skills:
        missing.append("Your skills")
    if not location:
        missing.append("Your city or preferred location")
    if p and not p.education:
        missing.append("Education")
    factors = [f"Experience level: {seniority or 'not set'} → placed at the {int(q * 100)}th percentile of the market range."]
    factors += [f"{x['skill']}: postings mentioning it have a median of ${x['median_with_skill']:,} "
                f"({x['premium_pct']:+.0f}% vs. all, {x['postings']} postings)." for x in prem[:4]]
    result = {
        "title": title, "location": market["location"], "currency": "USD", "period": "year",
        "estimate": {"low": round(low, -3), "mid": round(point, -3), "high": round(high, -3)},
        "confidence": confidence, "seniority": seniority, "factors": factors, "missing_information": missing,
        "market": public(market),
        "disclaimer": "An estimate from public postings, not a guarantee or an offer.",
    }
    ex = provider.structured("salary_explain", f"Data (do not change numbers): {result}", SalaryExplanation, user_id=user.id, effort="low")
    if ex:
        result["explanation"] = ex.model_dump()
    return result


def _seniority_from_years(y: float) -> str:
    return "entry" if y < 2 else "mid" if y < 5 else "senior" if y < 9 else "lead"


def growth_plan(db: Session, user, profile: UserProfile | None, title: str | None = None) -> dict:
    a = assess(db, user, profile, title)
    if "estimate" not in a:
        return a
    market = market_research(db, a["title"], None, None)
    rows = market.get("_rows") or []
    have = {s.skill.lower() for s in db.scalars(select(UserSkill).where(UserSkill.user_id == user.id))}
    from .resume.analysis import _LEX, MULTI
    candidates = [k for k in list(MULTI) + list(_LEX) if len(k) > 2 and k not in have]
    freq = []
    overall = market["stats"]["median"] if market.get("stats") else None
    for k in candidates:
        hits = [v for r, v in rows if re.search(rf"(?<![a-z]){re.escape(k)}(?![a-z])", ((r.description or "") + " " + r.title).lower())]
        if len(hits) >= max(4, len(rows) // 25):
            freq.append({"skill": k, "postings": len(hits), "median_with_skill": round(statistics.median(hits)),
                         "premium_pct": round(100 * (statistics.median(hits) - overall) / overall, 1) if overall else 0})
    freq.sort(key=lambda x: (-x["premium_pct"], -x["postings"]))
    sen = a.get("seniority")
    nxt = SENIORITY_ORDER[min(SENIORITY_ORDER.index(sen) + 1, len(SENIORITY_ORDER) - 1)] if sen in SENIORITY_ORDER else "senior"
    by = market.get("by_seniority", {})
    scenarios = []
    if nxt in by:
        scenarios.append({"milestone": f"Reach {nxt}-level scope", "median": by[nxt]["median"], "sample": by[nxt]["sample"]})
    for s in freq[:3]:
        if s["premium_pct"] > 0:
            scenarios.append({"milestone": f"Add proven {s['skill']} experience", "median": s["median_with_skill"], "sample": s["postings"]})
    return {"current": a["estimate"], "title": a["title"], "skills_to_build": freq[:8], "scenarios": scenarios,
            "disclaimer": "Scenarios compare medians of public postings. They are estimates, not guaranteed outcomes."}


class NegotiationAdvice(BaseModel):
    counter_low: float
    counter_high: float
    arguments: list[str] = Field(default_factory=list)
    message: str = ""
    risks: list[str] = Field(default_factory=list)


def negotiate(db: Session, user, profile, title: str, location: str | None, base: float, bonus: float = 0,
              equity_yearly: float = 0, notes: str = "") -> dict:
    market = market_research(db, title, location, None)
    if not market.get("sample_size"):
        return {"error": market.get("message")}
    st = market["stats"]
    pos = sum(1 for v in market["_values"] if v <= base) / len(market["_values"])
    target_lo = max(base * 1.05, st["median"]) if base < st["p75"] else base * 1.03
    target_hi = max(target_lo * 1.04, min(st["p75"] * 1.05, base * 1.15))
    result = {"offer": {"base": base, "bonus": bonus, "equity_yearly": equity_yearly, "total": base + bonus + equity_yearly},
              "market": public(market), "offer_percentile": round(pos * 100),
              "suggested_counter": {"low": round(target_lo, -3), "high": round(target_hi, -3)},
              "arguments": [f"The offer sits at about the {round(pos * 100)}th percentile of {market['sample_size']} postings "
                            f"for {title} ({market['location']}); the median is ${st['median']:,}."],
              "message": (f"Thank you for the offer — I'm excited about the role. Based on the scope of the position and "
                          f"market data for {title} roles, I'd like to discuss a base salary in the range of "
                          f"${round(target_lo, -3):,.0f}–${round(target_hi, -3):,.0f}. I'm confident I can bring strong "
                          f"results to the team, and I'm flexible on how we structure the overall package."),
              "disclaimer": "Negotiation outcomes are never guaranteed. Base salary and total compensation are shown separately."}
    ai = provider.structured("negotiate", f"Market and offer (keep numbers): {public(result)}\nCandidate notes: {notes[:2000]}\n"
                                          f"Candidate profile: title={getattr(profile, 'current_title', '')}, "
                                          f"years={getattr(profile, 'years_experience', '')}", NegotiationAdvice, user_id=user.id)
    if ai:
        result["arguments"] = result["arguments"] + ai.arguments
        result["message"] = ai.message or result["message"]
        result["risks"] = ai.risks
    return result
