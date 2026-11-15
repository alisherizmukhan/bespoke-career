"""Small input/output sanitizers shared by routers (injection hardening outside the AI layer)."""
import re

_LIKE_SPECIAL = re.compile(r"([\\%_])")


def like(term: str) -> str:
    """Pattern for `.ilike(like(x), escape="\\")`: user text matches literally; % _ and \\ are not wildcards."""
    return "%" + _LIKE_SPECIAL.sub(lambda m: "\\" + m.group(1), (term or "")[:200]) + "%"


def safe_url(url: str | None) -> str | None:
    """Only http(s) links leave the API; blocks javascript:, data: and similar schemes from scraped postings."""
    if not url:
        return None
    u = url.strip()
    return u if re.match(r"^https?://", u, re.I) else None


def safe_link(link: str | None) -> str:
    """Admin-editable links: a site path or an https URL."""
    l = (link or "").strip()
    if not l:
        return ""
    if l.startswith("/") and not l.startswith("//"):
        return l
    return l if re.match(r"^https://", l, re.I) else ""


def csv_cell(v):
    """Neutralise spreadsheet formulas (CSV/Excel injection): =, +, -, @, tab and CR at the start of a text cell."""
    if isinstance(v, str) and v[:1] in ("=", "+", "-", "@", "\t", "\r"):
        return "'" + v
    return v
