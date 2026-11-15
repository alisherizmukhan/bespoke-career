"""ATS analysis, validation (incl. unsupported-claim detection) and profession-aware generation."""
import json
import re
from collections import Counter

from ..ai import guard, provider
from .knowledge import DOC_BY_SLUG, SECTION_LABELS
from .schema import AtsAdvice, GeneratedResume, ResumeContent, content_text

SKILL_LEXICON = """
python java javascript typescript go golang rust c++ c# ruby php kotlin swift scala r sql nosql postgresql mysql mongodb redis
html css react angular vue node.js django flask fastapi spring .net graphql rest api microservices kafka spark hadoop airflow
aws azure gcp google cloud docker kubernetes terraform ansible ci/cd jenkins github actions linux git agile scrum jira
machine learning deep learning nlp computer vision pytorch tensorflow pandas numpy scikit-learn llm statistics a/b testing
tableau power bi looker excel salesforce hubspot sap oracle netsuite quickbooks workday zendesk figma sketch adobe photoshop
illustrator indesign after effects premiere seo sem google analytics google ads content strategy copywriting crm
financial modeling forecasting budgeting gaap ifrs audit tax accounts payable accounts receivable reconciliation fp&a cpa cfa
project management pmp stakeholder management product management roadmap user research ux ui wireframing prototyping
customer success account management negotiation lead generation cold calling b2b saas pipeline management quota
patient care bls acls cpr emr ehr epic cerner phlebotomy triage medication administration hipaa nursing icu telemetry
recruiting onboarding hris payroll employee relations compliance risk management supply chain logistics procurement inventory
lean six sigma quality assurance osha autocad revit solidworks matlab plc data analysis data visualization etl dbt snowflake
communication leadership teamwork problem solving time management mentoring public speaking spanish bilingual
""".split("\n")
_LEX = set()
for line in SKILL_LEXICON:
    for tok in re.split(r"\s{1,}", line.strip()):
        if tok:
            _LEX.add(tok)
MULTI = ["machine learning", "deep learning", "computer vision", "google cloud", "github actions", "a/b testing", "power bi",
         "google analytics", "google ads", "content strategy", "financial modeling", "accounts payable", "accounts receivable",
         "project management", "stakeholder management", "product management", "user research", "customer success",
         "account management", "lead generation", "cold calling", "pipeline management", "patient care",
         "medication administration", "employee relations", "risk management", "supply chain", "lean six sigma",
         "quality assurance", "data analysis", "data visualization", "problem solving", "time management", "public speaking",
         "after effects", "rest api", "ci/cd", "node.js", "scikit-learn", "six sigma", "adobe photoshop"]
STOP = set("""a an the and or of to in for with on at by from as is are be will you your we our their this that these those
it its into over under within across using use able ability strong excellent proven experience years year work working
team teams role position job candidate including include such other more plus well new must should can may all any per
""".split())
SOFT = {"communication", "leadership", "teamwork", "problem solving", "time management", "mentoring", "public speaking"}
WEAK_PHRASES = ["responsible for", "duties included", "worked on", "helped with", "tasked with", "in charge of"]


def _norm(s: str) -> str:
    return re.sub(r"\s+", " ", s.lower())


def extract_keywords(jd: str) -> dict:
    text = _norm(jd)
    req_part, pref_part = text, ""
    m = re.search(r"(preferred|nice to have|bonus points|pluses|desired)", text)
    if m:
        req_part, pref_part = text[:m.start()], text[m.start():]

    def found(part: str) -> list[str]:
        out = []
        for phrase in MULTI:
            if phrase in part:
                out.append(phrase)
        for tok in re.findall(r"[a-z][a-z0-9+#./&-]{1,24}", part):
            tok = tok.strip(".,")
            if tok in _LEX and tok not in out and not any(tok in p for p in out if " " in p):
                out.append(tok)
        return out

    required = found(req_part)
    preferred = [k for k in found(pref_part) if k not in required]
    # frequent capitalized terms the lexicon doesn't know (e.g. product names)
    caps = Counter(w for w in re.findall(r"\b[A-Z][a-zA-Z0-9+]{2,}\b", jd) if w.lower() not in STOP)
    extra = [w.lower() for w, n in caps.most_common(30) if n >= 2 and w.lower() not in required + preferred
             and w.lower() not in {"we", "you", "our", "the", "this", "about", "what", "who", "how", "requirements",
                                   "responsibilities", "qualifications", "benefits", "job", "role", "team", "company"}][:8]
    yrs = re.search(r"(\d+)\+?\s*(?:-\s*\d+\s*)?years?", text)
    degree = re.search(r"(bachelor'?s?|master'?s?|ph\.?d|mba|associate'?s?) (degree)?", text)
    title = jd.strip().splitlines()[0][:120] if jd.strip() else ""
    return {"required": required, "preferred": preferred, "other_terms": extra,
            "years_required": int(yrs.group(1)) if yrs else None, "degree": degree.group(1) if degree else None,
            "title": title}


def _has(resume_text: str, kw: str) -> bool:
    k = re.escape(kw)
    return bool(re.search(rf"(?<![a-z0-9]){k}(?![a-z0-9])", resume_text))


def analyze(content: ResumeContent, jd: str | None, document_type: str = "professional", user_id=None) -> dict:
    text = _norm(content_text(content))
    issues, recs = [], []
    # structure
    doc = DOC_BY_SLUG.get(document_type, DOC_BY_SLUG["professional"])
    present = {s for s in doc["sections"] if _section_filled(content, s)}
    missing_sections = [SECTION_LABELS[s] for s in doc["sections"][:4] if s not in present]
    if not content.contact.email:
        issues.append("Add an email address to the header.")
    if not content.contact.phone:
        issues.append("Add a phone number to the header.")
    bullets = [b for e in content.experience for b in e.bullets]
    quantified = [b for b in bullets if re.search(r"\d", b)]
    long_bullets = [b for b in bullets if len(b.split()) > 35]
    weak = [b for b in bullets if any(p in b.lower() for p in WEAK_PHRASES)]
    no_dates = [e.title or e.company for e in content.experience if not (e.start or e.end)]
    if missing_sections:
        issues.append(f"Missing sections for a {doc['name']}: {', '.join(missing_sections)}.")
    if long_bullets:
        issues.append(f"{len(long_bullets)} bullet(s) are longer than 35 words; split or tighten them.")
    if weak:
        recs.append(f"Replace passive phrasing like “responsible for” with action verbs in {len(weak)} bullet(s).")
    if no_dates:
        issues.append(f"Add dates to: {', '.join(x for x in no_dates if x)[:200]}.")
    if bullets and len(quantified) / len(bullets) < 0.3:
        recs.append("Where you know real numbers (volume, %, $, time saved), add them; under 30% of your bullets show a measurable result.")
    words = len(text.split())
    if words > 1200 and doc["max_pages"] <= 2:
        issues.append(f"About {words} words, likely longer than {doc['max_pages']} pages. Trim older or less relevant details.")
    if words < 150:
        issues.append("The resume is very short; add responsibilities and results for each role.")

    structure_score = max(0, 100 - 12 * len(missing_sections) - 8 * len(no_dates) - 6 * len(long_bullets)
                          - (10 if not content.contact.email else 0))
    quality_score = min(100, 40 + int(60 * (len(quantified) / len(bullets))) if bullets else 30) - 5 * len(weak)

    result = {"document_type": document_type, "structure_score": max(0, min(100, structure_score)),
              "quality_score": max(0, min(100, quality_score)), "formatting_issues": issues, "recommendations": recs,
              "stats": {"words": words, "bullets": len(bullets), "quantified_bullets": len(quantified)}}
    if jd and jd.strip():
        kw = extract_keywords(jd)
        matched_req = [k for k in kw["required"] if _has(text, k)]
        missing_req = [k for k in kw["required"] if not _has(text, k)]
        matched_pref = [k for k in kw["preferred"] if _has(text, k)]
        missing_pref = [k for k in kw["preferred"] if not _has(text, k)]
        total = 2 * len(kw["required"]) + len(kw["preferred"])
        coverage = (2 * len(matched_req) + len(matched_pref)) / total if total else 0.6
        title_words = [w for w in re.findall(r"[a-z]+", kw["title"].lower()) if w not in STOP and len(w) > 2]
        resume_titles = _norm(" ".join([content.headline] + [e.title for e in content.experience]))
        title_match = (sum(1 for w in title_words if w in resume_titles) / len(title_words)) if title_words else 0.5
        match = int(round(100 * (0.6 * coverage + 0.15 * title_match + 0.25 * result["structure_score"] / 100)))
        result.update(match_score=max(0, min(100, match)), keywords={
            "matched_required": matched_req, "missing_required": missing_req,
            "matched_preferred": matched_pref, "missing_preferred": missing_pref, "other_terms": kw["other_terms"]},
            title_alignment=round(title_match, 2), years_required=kw["years_required"], degree_required=kw["degree"])
        hard_missing = [k for k in missing_req if k not in SOFT]
        if hard_missing:
            result["recommendations"].insert(0, "If you genuinely have these skills, name them in your skills or bullets: "
                                                + ", ".join(hard_missing[:10]) + ".")
        advice = provider.structured(
            "ats_analyze",
            guard.fence("job_description", jd, 12000) + "\n\n" + guard.fence("resume", content.model_dump_json(), 30000) + "\n\n"
            f"Keyword check already done: matched={matched_req + matched_pref}, missing={missing_req + missing_pref}.",
            AtsAdvice, user_id=user_id)
        if advice:
            result["recommendations"] += advice.recommendations
            result["missing_qualifications"] = advice.missing_qualifications
            result["rewrite_suggestions"] = advice.rewrite_suggestions
            result["ai"] = True
    result["score"] = result.get("match_score", int((result["structure_score"] + result["quality_score"]) / 2))
    result["disclaimer"] = "Internal diagnostic estimate, not an official employer ATS score."
    return result


def _section_filled(c: ResumeContent, s: str) -> bool:
    v = getattr(c, s, None)
    return bool(v.strip() if isinstance(v, str) else v)


# ------------------------------------------------------------------ validation


def _facts(c: ResumeContent) -> dict[str, set[str]]:
    return {
        "employers": {_norm(e.company) for e in c.experience if e.company},
        "titles": {_norm(e.title) for e in c.experience if e.title},
        "institutions": {_norm(e.institution) for e in c.education if e.institution},
        "degrees": {_norm(e.degree) for e in c.education if e.degree},
        "certifications": {_norm(x.name) for x in c.certifications if x.name},
        "numbers": set(re.findall(r"\d[\d,.]*%?", content_text(c))),
    }


def validate(content: ResumeContent, source: ResumeContent | None, document_type: str, jd: str | None = None) -> dict:
    checks = []
    doc = DOC_BY_SLUG.get(document_type, DOC_BY_SLUG["professional"])
    missing = [SECTION_LABELS[s] for s in doc["sections"][:4] if not _section_filled(content, s)]
    checks.append({"check": "completeness", "ok": not missing and bool(content.contact.full_name),
                   "detail": f"Missing: {', '.join(missing)}" if missing else "All key sections present."})
    unsupported = []
    if source is not None:
        src = _facts(source)
        src_text = _norm(content_text(source))
        gen = _facts(content)
        for kind in ("employers", "institutions", "degrees", "certifications"):
            for v in gen[kind] - src[kind]:
                if v and v not in src_text:
                    unsupported.append(f"{kind[:-1].capitalize()} not in your verified data: “{v}”")
        for n in gen["numbers"] - src["numbers"]:
            if len(n.strip("%.,")) >= 2 and n not in src_text:
                unsupported.append(f"Number not found in your data: {n}")
    checks.append({"check": "unsupported_claims", "ok": not unsupported,
                   "detail": "; ".join(unsupported[:10]) if unsupported else "Every fact traces back to your verified data."})
    text = content_text(content)
    grammar = []
    if re.search(r"\b(\w+) \1\b", text, re.I):
        grammar.append("Repeated word detected.")
    if re.search(r"(^|\n)\s*I\s", text):
        grammar.append("Avoid first-person “I” in bullets.")
    if re.search(r"  +", text):
        grammar.append("Double spaces found.")
    checks.append({"check": "grammar_clarity", "ok": not grammar, "detail": " ".join(grammar) or "No obvious issues."})
    if jd:
        a = analyze(content, jd, document_type)
        checks.append({"check": "job_alignment", "ok": a.get("match_score", 0) >= 60,
                       "detail": f"Match {a.get('match_score', 0)}/100; missing: {', '.join(a['keywords']['missing_required'][:8]) or 'none'}"})
    return {"ok": all(c["ok"] for c in checks), "checks": checks, "unsupported_claims": unsupported}


# ------------------------------------------------------------------ generation


def _rank(items: list[str], kws: list[str]) -> list[str]:
    def score(s: str) -> int:
        l = s.lower()
        return -sum(1 for k in kws if k in l)
    return sorted(items, key=score)


def generate(source: ResumeContent, document_type: str, jd: str | None, user_id=None) -> tuple[ResumeContent, dict]:
    doc = DOC_BY_SLUG.get(document_type, DOC_BY_SLUG["professional"])
    ai = provider.structured(
        "resume_generate",
        json.dumps({"document_type": doc["name"], "document_guidance": doc["description"],
                    "section_order": doc["sections"], "max_pages": doc["max_pages"],
                    "job_description": guard.clean(jd or "", 12000), "verified_resume_data": source.model_dump()}),
        GeneratedResume, user_id=user_id)
    if ai is not None:
        v = validate(ai.content, source, document_type)
        if not v["unsupported_claims"]:
            return ai.content, {"method": "ai", "missing_information": ai.missing_information, "notes": ai.notes}
        # The model added something that isn't in the verified data: fall back to the safe deterministic version.
    c = source.model_copy(deep=True)
    kws = []
    if jd:
        k = extract_keywords(jd)
        kws = k["required"] + k["preferred"]
        c.skills = _rank(list(dict.fromkeys(c.skills)), kws)
        for e in c.experience:
            e.bullets = _rank(e.bullets, kws)
        c.projects.sort(key=lambda p: -sum(1 for k in kws if k in (p.name + p.description).lower()))
    missing = []
    if not c.summary:
        missing.append("A 2-3 sentence professional summary")
    if c.experience and not any(re.search(r"\d", b) for e in c.experience for b in e.bullets):
        missing.append("Measurable results (numbers you know) for your main roles")
    if not c.skills:
        missing.append("Your key skills")
    return c, {"method": "rules", "missing_information": missing,
               "notes": ["Reordered skills and bullets to match the job description."] if kws else []}
