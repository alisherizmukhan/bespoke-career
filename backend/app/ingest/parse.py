"""Field extraction and normalization for job postings (US-first; also handles free-text posts)."""
import hashlib
import html as htmllib
import re

from bs4 import BeautifulSoup

US_STATES = {
    "AL": "Alabama", "AK": "Alaska", "AZ": "Arizona", "AR": "Arkansas", "CA": "California", "CO": "Colorado",
    "CT": "Connecticut", "DE": "Delaware", "DC": "District of Columbia", "FL": "Florida", "GA": "Georgia",
    "HI": "Hawaii", "ID": "Idaho", "IL": "Illinois", "IN": "Indiana", "IA": "Iowa", "KS": "Kansas",
    "KY": "Kentucky", "LA": "Louisiana", "ME": "Maine", "MD": "Maryland", "MA": "Massachusetts", "MI": "Michigan",
    "MN": "Minnesota", "MS": "Mississippi", "MO": "Missouri", "MT": "Montana", "NE": "Nebraska", "NV": "Nevada",
    "NH": "New Hampshire", "NJ": "New Jersey", "NM": "New Mexico", "NY": "New York", "NC": "North Carolina",
    "ND": "North Dakota", "OH": "Ohio", "OK": "Oklahoma", "OR": "Oregon", "PA": "Pennsylvania", "RI": "Rhode Island",
    "SC": "South Carolina", "SD": "South Dakota", "TN": "Tennessee", "TX": "Texas", "UT": "Utah", "VT": "Vermont",
    "VA": "Virginia", "WA": "Washington", "WV": "West Virginia", "WI": "Wisconsin", "WY": "Wyoming",
}
US_CITIES = ["new york", "san francisco", "los angeles", "seattle", "austin", "boston", "chicago", "denver", "atlanta",
             "miami", "dallas", "houston", "washington", "philadelphia", "phoenix", "san diego", "san jose",
             "portland", "nashville", "salt lake", "minneapolis", "detroit", "pittsburgh", "raleigh", "charlotte",
             "palo alto", "mountain view", "menlo park", "sunnyvale", "brooklyn", "orlando", "las vegas"]
NON_US = re.compile(r"\b(canada|toronto|vancouver|montreal|london|uk\b|united kingdom|england|ireland|dublin|germany|berlin|"
                    r"munich|france|paris|spain|madrid|barcelona|netherlands|amsterdam|poland|warsaw|india|bengaluru|bangalore|"
                    r"hyderabad|pune|singapore|japan|tokyo|australia|sydney|melbourne|brazil|são paulo|sao paulo|mexico|"
                    r"argentina|colombia|israel|tel aviv|china|korea|seoul|philippines|portugal|lisbon|italy|sweden|"
                    r"switzerland|zurich|denmark|norway|finland|estonia|ukraine|romania|emea|apac|latam|europe)\b", re.I)

CATEGORIES = [
    ("Software Engineering", ["software", "engineer", "developer", "devops", "sre", "frontend", "front-end", "backend", "back-end",
                              "full stack", "fullstack", "mobile", "ios", "android", "qa ", "test automation", "security engineer",
                              "infrastructure", "platform", "programmer", "разработчик", "программист"]),
    ("Data & AI", ["data", "analyst", "analytics", "machine learning", "ml ", " ai ", "ai ", "scientist", "research engineer",
                   "bi ", "statistic", "аналитик"]),
    ("Product & Project", ["product manager", "product owner", "program manager", "project manager", "scrum", "technical program"]),
    ("Design", ["designer", "design", "ux", "ui ", "creative director", "illustrator", "дизайнер"]),
    ("Marketing & Communications", ["marketing", "brand", "content", "seo", "social media", "communications", "pr ", "growth",
                                    "copywriter", "маркетолог"]),
    ("Sales & Customer Success", ["sales", "account executive", "account manager", "business development", "bdr", "sdr",
                                  "customer success", "partnerships", "solutions engineer", "solutions consultant", "продаж"]),
    ("Customer Support", ["support", "customer service", "call center", "help desk", "service desk"]),
    ("Finance & Accounting", ["finance", "accountant", "accounting", "controller", "tax", "audit", "treasury", "fp&a",
                              "payroll", "bookkeeper", "бухгалтер"]),
    ("People & HR", ["recruit", "talent", "people", "hr ", "human resources", "hrbp", "benefits"]),
    ("Healthcare", ["nurse", "rn ", "lpn", "cna", "physician", "medical", "clinical", "therapist", "pharmac", "dental",
                    "health", "caregiver", "patient"]),
    ("Education", ["teacher", "tutor", "instructor", "professor", "education", "curriculum", "school"]),
    ("Legal", ["counsel", "attorney", "lawyer", "legal", "paralegal", "compliance", "solicitor"]),
    ("Operations & Logistics", ["operations", "logistics", "supply chain", "warehouse", "driver", "procurement", "fleet",
                                "dispatcher", "inventory"]),
    ("Administrative", ["administrative", "assistant", "receptionist", "office manager", "executive assistant", "coordinator"]),
    ("Skilled Trades", ["technician", "electrician", "mechanic", "plumber", "hvac", "welder", "construction", "carpenter",
                        "maintenance"]),
    ("Hospitality & Retail", ["retail", "store", "cashier", "restaurant", "cook", "chef", "server", "barista", "hotel",
                              "hospitality"]),
]

EMOJI_RE = re.compile("[\U0001F000-\U0001FAFF☀-➿⬀-⯿️‍⃣←-⇿⌀-⏿■-◿]+")


def html_to_text(s: str | None, limit: int = 8000) -> str | None:
    if not s:
        return None
    s = htmllib.unescape(s) if "&lt;" in s else s
    text = BeautifulSoup(s, "lxml").get_text("\n")
    text = re.sub(r"\n\s*\n\s*\n+", "\n\n", text)
    text = re.sub(r"[ \t]+", " ", text).strip()
    return text[:limit]


def clean_line(s: str) -> str:
    s = EMOJI_RE.sub(" ", s)
    s = re.sub(r"[*_`~|]+", " ", s)
    s = re.sub(r"\s+", " ", s)
    return s.strip(" -–—:•·.,").strip()


def norm(s: str) -> str:
    return re.sub(r"[^a-zа-яё0-9]+", " ", (s or "").lower()).strip()


def fingerprint(title: str, company: str | None, location: str | None = None) -> str:
    return hashlib.sha256(f"{norm(title)}|{norm(company or '')}|{norm((location or '')[:40])}".encode()).hexdigest()


# ------------------------------------------------------------------ location


def is_us_location(loc: str | None, allow_unspecified_remote: bool = False) -> bool:
    if not loc:
        return allow_unspecified_remote
    l = loc.strip()
    low = l.lower()
    if re.search(r"\b(united states|u\.s\.a?\.?|usa|us-based|us only|americas|north america)\b", low) or re.search(r"\bUS\b", l):
        return True
    if re.search(r",\s*(" + "|".join(US_STATES) + r")\b", l) or any(n.lower() in low for n in US_STATES.values()):
        return not NON_US.search(low) or "united states" in low
    if any(c in low for c in US_CITIES) and not NON_US.search(low):
        return True
    if re.search(r"\b(worldwide|anywhere|global)\b", low):
        return True
    if low in ("remote", "remote, remote", "hybrid"):
        return allow_unspecified_remote
    return False


def detect_work_format(*texts: str | None) -> str | None:
    t = " ".join(x for x in texts if x).lower()
    if re.search(r"hybrid|гибрид", t):
        return "hybrid"
    if re.search(r"\bremote\b|work from home|wfh|удал[её]н", t):
        return "remote"
    if re.search(r"on-?site|in[- ]office|офис", t):
        return "onsite"
    return None


def detect_employment(text: str | None) -> str | None:
    t = (text or "").lower().replace("_", "-")
    if re.search(r"internship|\bintern\b|стажировк", t):
        return "internship"
    if re.search(r"part[- ]?time|частичн", t):
        return "part-time"
    if re.search(r"contract|freelance|temporary|temp\b|per diem|travel nurse", t):
        return "contract"
    if re.search(r"full[- ]?time|fulltime|permanent|полн", t):
        return "full-time"
    return None


def detect_seniority(text: str | None) -> str | None:
    t = (text or "").lower()
    for level, pat in [("executive", r"\b(vp|vice president|chief|cto|cfo|ceo|coo|director|head of)\b"),
                       ("lead", r"\b(lead|staff|principal|manager|architect)\b"),
                       ("senior", r"\b(senior|sr\.?)\b"),
                       ("intern", r"\b(intern|internship|trainee|apprentice)\b"),
                       ("entry", r"\b(junior|jr\.?|entry[- ]level|new grad|graduate|associate)\b"),
                       ("mid", r"\b(mid[- ]level|ii|iii)\b")]:
        if re.search(pat, t):
            return level
    return None


def detect_category(title: str, extra: str = "") -> str:
    t = f" {title.lower()} "
    for cat, keys in CATEGORIES:
        if any(k in t for k in keys):
            return cat
    b = f" {extra.lower()[:500]} "
    for cat, keys in CATEGORIES:
        if sum(1 for k in keys if k in b) >= 2:
            return cat
    return "Other"


# ------------------------------------------------------------------ salary


def _num(s: str) -> float | None:
    s = s.strip().lower().replace(" ", "")
    mult = 1000 if s.endswith("k") else (1_000_000 if s.endswith("m") else 1)
    s = s.rstrip("km")
    if re.fullmatch(r"\d{1,3}(,\d{3})+(\.\d+)?", s):
        s = s.replace(",", "")
    elif re.fullmatch(r"\d+,\d{1,2}", s):  # "35,3k" -> 35.3k
        s = s.replace(",", ".")
    else:
        s = s.replace(",", "")
    try:
        v = float(s) * mult
    except ValueError:
        return None
    return v if v > 0 else None


def detect_period(text: str, value: float | None = None) -> str | None:
    t = (text or "").lower()
    if re.search(r"/\s*h(ou)?r|per hour|hourly|an hour|/hr", t):
        return "hour"
    if re.search(r"/\s*week|per week|weekly|a week", t):
        return "week"
    if re.search(r"/\s*day|per day|daily|a day", t):
        return "day"
    if re.search(r"/\s*mo(nth)?|per month|monthly|a month", t):
        return "month"
    if re.search(r"/\s*y(ea)?r|per year|annual|yearly|a year|salary", t):
        return "year"
    if value is not None:
        return "hour" if value < 300 else ("year" if value >= 15000 else None)
    return None


SAL_RE = re.compile(
    r"(?:(?P<cur>\$|usd|€|eur|£|gbp)\s*)(?P<lo>\d[\d,.]*\s*[km]?)(?:\s*(?:-|–|—|to)\s*(?:\$|usd|€|£)?\s*(?P<hi>\d[\d,.]*\s*[km]?))?"
    r"(?P<tail>\s*(?:usd|eur)?\s*(?:/|per|an?)\s*(?:hour|hr|h|week|wk|day|month|mo|year|yr|annum)\b|\s*(?:hourly|weekly|monthly|yearly|annually))?",
    re.I)


def parse_salary(text: str | None) -> dict:
    """Returns {min, max, currency, period, text} or {} for US-style salary strings."""
    if not text:
        return {}
    for m in SAL_RE.finditer(text):
        lo = _num(m.group("lo"))
        hi = _num(m.group("hi")) if m.group("hi") else None
        if not lo or (hi and hi < lo):
            continue
        cur = {"$": "USD", "usd": "USD", "€": "EUR", "eur": "EUR", "£": "GBP", "gbp": "GBP"}[m.group("cur").lower()]
        snippet = m.group(0).strip()
        period = detect_period(m.group("tail") or "", max(v for v in (lo, hi) if v)) if m.group("tail") else detect_period("", max(v for v in (lo, hi) if v))
        if max(v for v in (lo, hi) if v) < 7:  # "$1 billion", "$5 bonus"
            continue
        return {"salary_min": lo, "salary_max": hi, "currency": cur, "salary_period": period, "salary_text": snippet[:160]}
    return {}


def annualize(value: float | None, period: str | None) -> float | None:
    if value is None:
        return None
    return value * {"hour": 2080, "day": 260, "week": 52, "month": 12, "year": 1}.get(period or "year", 1)


# ------------------------------------------------------------------ free-text posts (Telegram)

STRONG_JOB = re.compile(r"\bhiring\b|we'?re looking|we are looking|join our team|responsibilities|requirements|"
                        r"apply (now|here)|salary|compensation|open (role|position)|job opening|"
                        r"требуе?тся|требуются|ищем|ваканси|обязанности|требования|зарплат", re.I)
JOB_WORDS = ["hiring", "apply", "responsibilities", "requirements", "salary", "remote", "full-time", "part-time",
             "experience", "position", "role", "team", "benefits", "ваканси", "требуется", "обязанности", "зарплата"]
AD_WORDS = ["course", "webinar", "bootcamp", "discount", "promo", "sponsored", "giveaway", "tip:", "resume tip",
            "subscribe", "курс", "вебинар", "скидк", "реклама"]
NOT_JOB = re.compile(r"not a job|resume tip|quick tip|here'?s what you should know|#resume|#cv\b|looking for work|"
                     r"open to work|my name is|^\s*i am\b|это не вакансия|ищу работу|подборк", re.I | re.M)
GENERIC_TITLE = re.compile(r"^(new job|job|jobs|hiring|we are hiring|we're hiring|vacancy|new vacancy|hello|hi|hey|"
                           r"attention|urgent|новая вакансия|вакансия|привет\w*)\W*$", re.I)


def is_digest(text: str) -> bool:
    links = len(re.findall(r"https?://\S+", text))
    bullets = len(re.findall(r"^\s*(?:[-•—▪️🔹✅📍]|\d+[.)])\s*\S", text, re.M))
    return links >= 4 or (bullets >= 6 and not re.search(r"responsib|requirement|обязанност", text, re.I)) \
        or bool(re.match(r"^\s*\d+\s+(remote )?(roles|jobs|positions)\b", text, re.I))


def looks_like_job(text: str) -> bool:
    if len(text) < 80 or NOT_JOB.search(text) or is_digest(text):
        return False
    low = text.lower()
    good = sum(1 for w in JOB_WORDS if w in low)
    bad = sum(1 for w in AD_WORDS if w in low)
    return bool(STRONG_JOB.search(text)) and good >= 2 and good > bad * 1.5


def extract_title(text: str) -> str | None:
    lines = [clean_line(l) for l in text.splitlines() if clean_line(l)]
    for ln in lines[:10]:
        m = re.match(r"^(?:position|role|title|job|vacancy|должность|позиция)\s*[:\-]\s*(.{3,120})$", ln, re.I)
        if m:
            return m.group(1)
    for ln in lines[:6]:
        m = re.search(r"(?:hiring|looking for|seeking|требуется|ищем)\s*(?:an?\s+)?[:\-]?\s*(.{3,100})", ln, re.I)
        if m:
            cand = re.split(r"[.!?]|\s—\s|\s\(remote\)", m.group(1))[0].strip()
            if 3 <= len(cand) <= 100 and not GENERIC_TITLE.match(cand):
                return cand
    for ln in lines[:5]:
        c = re.sub(r"#\S+", "", ln).strip()
        if 4 <= len(c) <= 120 and not GENERIC_TITLE.match(c) and not c.lower().startswith("http"):
            return c
    return None


def extract_company(text: str) -> str | None:
    for ln in text.splitlines()[:15]:
        m = re.match(r"^\s*(?:🏢|🏬|company|employer|компания)\s*[:\-]?\s*(.{2,100})$", clean_line(ln) if not ln.strip().startswith("🏢") else ln.strip(), re.I)
        if m:
            return clean_line(m.group(1))
    m = re.search(r"\bat\s+([A-Z][\w&.\- ]{1,40}?)(?:[,.!\n]| is | are )", text)
    if m:
        return m.group(1).strip()
    m = re.search(r"\[([^\]]{2,60})\]", text[:200])
    return m.group(1).strip() if m else None


def extract_contacts(text: str) -> list[str]:
    out = re.findall(r"[\w.+-]+@[\w-]+\.[\w.]+", text) + re.findall(r"(?<![\w/])@[A-Za-z][\w]{3,31}", text)
    return list(dict.fromkeys(c.strip() for c in out))[:6]


def extract_tags(text: str) -> list[str]:
    tags = [t.lower() for t in re.findall(r"#([\w]{2,40})", text)]
    return [t for t in dict.fromkeys(tags) if t not in {"job", "jobs", "hiring", "vacancy"}][:10]
