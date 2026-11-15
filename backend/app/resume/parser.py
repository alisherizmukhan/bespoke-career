"""Resume text extraction (PDF/DOCX) and parsing into ResumeContent (AI when available, heuristics otherwise)."""
import io
import re

from ..ai import guard, provider
from .schema import Certification, Contact, Education, Experience, Project, ResumeContent, Section

SECTION_ALIASES = {
    "summary": ["summary", "professional summary", "profile", "about me", "objective", "career objective", "overview"],
    "experience": ["experience", "work experience", "professional experience", "employment history", "employment",
                   "work history", "relevant experience", "career history"],
    "education": ["education", "academic background", "education and training", "academic history"],
    "skills": ["skills", "technical skills", "core competencies", "competencies", "key skills", "areas of expertise",
               "tools", "technologies"],
    "certifications": ["certifications", "certificates", "licenses", "licenses and certifications", "certifications and licenses"],
    "projects": ["projects", "selected projects", "personal projects", "academic projects", "research projects"],
    "publications": ["publications", "papers", "selected publications"],
    "awards": ["awards", "honors", "awards and honors", "honors and awards", "achievements", "grants"],
    "volunteering": ["volunteering", "volunteer experience", "volunteer", "activities", "leadership", "extracurricular activities"],
    "languages": ["languages"],
}
ALIAS = {a: k for k, v in SECTION_ALIASES.items() for a in v}
MONTHS = r"(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?"
DATE = rf"(?:{MONTHS}\s+\d{{4}}|\d{{1,2}}/\d{{4}}|\d{{4}})"
RANGE = re.compile(rf"({DATE})\s*(?:-|–|—|to)\s*({DATE}|present|current|now)", re.I)


def extract_text(data: bytes, content_type: str) -> str:
    if content_type == "application/pdf":
        from pypdf import PdfReader

        reader = PdfReader(io.BytesIO(data))
        return "\n".join((p.extract_text() or "") for p in reader.pages).strip()
    if content_type in ("application/vnd.openxmlformats-officedocument.wordprocessingml.document",):
        import docx

        d = docx.Document(io.BytesIO(data))
        lines = [p.text for p in d.paragraphs]
        for t in d.tables:
            for row in t.rows:
                lines.append(" | ".join(c.text for c in row.cells))
        return "\n".join(lines).strip()
    return data.decode("utf-8", errors="ignore")


def _header(line: str) -> str | None:
    l = re.sub(r"[^a-z &]", "", line.lower()).strip()
    if 2 < len(l) <= 40 and l in ALIAS:
        return ALIAS[l]
    return None


def heuristic_parse(text: str) -> ResumeContent:
    lines = [l.rstrip() for l in text.splitlines()]
    lines = [l for l in lines if l.strip()]
    c = ResumeContent()
    head = "\n".join(lines[:8])
    if m := re.search(r"[\w.+-]+@[\w-]+\.[\w.]+", head):
        c.contact.email = m.group(0)
    if m := re.search(r"(\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}", head):
        c.contact.phone = m.group(0)
    if m := re.search(r"(https?://)?(www\.)?linkedin\.com/in/[\w-]+/?", text):
        c.contact.linkedin = m.group(0)
    if m := re.search(r"\b([A-Z][a-zA-Z .]+,\s*[A-Z]{2})\b", head):
        c.contact.location = m.group(1).strip()
    if lines:
        first = lines[0].strip()
        if len(first.split()) <= 5 and not re.search(r"@|\d", first):
            c.contact.full_name = first.title() if first.isupper() else first
        if len(lines) > 1 and not _header(lines[1]) and not re.search(r"@|\d{3}", lines[1]) and len(lines[1]) < 90:
            c.headline = lines[1].strip()

    sections: dict[str, list[str]] = {}
    current = None
    for l in lines:
        h = _header(l)
        if h:
            current = h
            sections.setdefault(h, [])
            continue
        if current:
            sections[current].append(l.strip())

    bullet = re.compile(r"^\s*(?:[•\-–*▪●◦]|\d+\.)\s*")
    if "summary" in sections:
        c.summary = " ".join(sections["summary"])[:1500]
    if "skills" in sections:
        raw = " , ".join(sections["skills"])
        raw = re.sub(r"^[A-Za-z &/]+:\s*", "", raw, flags=re.M)
        c.skills = [s.strip(" •-·") for s in re.split(r"[,;|•·]|\s{2,}", raw) if 1 < len(s.strip(" •-·")) < 50][:60]
    if "experience" in sections:
        cur: Experience | None = None
        for l in sections["experience"]:
            m = RANGE.search(l)
            if m and not bullet.match(l):
                if cur:
                    c.experience.append(cur)
                rest = (l[:m.start()] + l[m.end():]).strip(" ,|-–—")
                parts = [p.strip() for p in re.split(r"\s[|–—-]\s|,\s| at ", rest) if p.strip()]
                cur = Experience(title=parts[0] if parts else "", company=parts[1] if len(parts) > 1 else "",
                                 location=parts[2] if len(parts) > 2 else "", start=m.group(1),
                                 end=m.group(m.lastindex) if m.lastindex else "",
                                 current=bool(re.search(r"present|current|now", m.group(0), re.I)))
            elif cur is not None:
                if bullet.match(l) or len(l) > 60:
                    cur.bullets.append(bullet.sub("", l))
                elif not cur.company:
                    cur.company = l
                elif not cur.bullets and not cur.location and len(l) < 40:
                    cur.location = l
                else:
                    cur.bullets.append(l)
            else:
                cur = Experience(title=l)
        if cur:
            c.experience.append(cur)
    if "education" in sections:
        cur_ed: Education | None = None
        for l in sections["education"]:
            if re.search(r"universit|college|institute|school|academy", l, re.I) and (cur_ed is None or cur_ed.institution):
                if cur_ed:
                    c.education.append(cur_ed)
                cur_ed = Education(institution=re.sub(RANGE, "", l).strip(" ,|-"))
                if m := RANGE.search(l):
                    cur_ed.start, cur_ed.end = m.group(1), m.group(m.lastindex)
                elif m := re.search(r"(19|20)\d{2}", l):
                    cur_ed.end = m.group(0)
            elif cur_ed is not None and not cur_ed.degree and re.search(r"bachelor|master|b\.?s|m\.?s|b\.?a|m\.?a|ph\.?d|mba|associate|diploma|degree", l, re.I):
                cur_ed.degree = l
            elif cur_ed is None:
                cur_ed = Education(degree=l)
            elif m := re.search(r"gpa[:\s]*([\d.]+)", l, re.I):
                cur_ed.gpa = m.group(1)
        if cur_ed:
            c.education.append(cur_ed)
    if "certifications" in sections:
        c.certifications = [Certification(name=bullet.sub("", l)) for l in sections["certifications"]][:20]
    if "projects" in sections:
        cur_p = None
        for l in sections["projects"]:
            if bullet.match(l) and cur_p:
                cur_p.bullets.append(bullet.sub("", l))
            else:
                if cur_p:
                    c.projects.append(cur_p)
                cur_p = Project(name=l[:120])
        if cur_p:
            c.projects.append(cur_p)
    for key in ("publications", "awards", "volunteering", "languages"):
        if key in sections:
            setattr(c, key, [bullet.sub("", l) for l in sections[key]][:30])
    if not sections:
        c.extra_sections.append(Section(title="Unsorted content", items=lines[1:60]))
    return c


def parse_resume(text: str, user_id=None) -> tuple[ResumeContent, str]:
    """Returns (content, method)."""
    ai = provider.structured("resume_parse", guard.fence("resume", text, 60000), ResumeContent, user_id=user_id, effort="low")
    if ai is not None:
        return ai, "ai"
    return heuristic_parse(text), "heuristic"


def from_profile(profile, skills: list[str], email: str) -> ResumeContent:
    """Build a starting resume from the verified onboarding profile."""
    c = ResumeContent(contact=Contact(full_name=profile.full_name or "", email=email,
                                      location=", ".join(x for x in [profile.city, profile.country] if x),
                                      linkedin=profile.linkedin_url or "", website=profile.portfolio_url or ""))
    c.headline = profile.current_title or profile.target_title or ""
    c.summary = profile.career_goals or ""
    c.skills = skills
    for e in profile.education or []:
        if isinstance(e, dict):
            c.education.append(Education(**{k: str(v) for k, v in e.items() if k in Education.model_fields}))
    for cert in profile.certifications or []:
        c.certifications.append(Certification(name=str(cert)))
    for emp in profile.previous_employers or []:
        if isinstance(emp, dict):
            c.experience.append(Experience(**{k: v for k, v in emp.items() if k in Experience.model_fields}))
        else:
            c.experience.append(Experience(company=str(emp)))
    c.awards = [str(a) for a in profile.achievements or []]
    return c
