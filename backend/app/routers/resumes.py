"""Resume Intelligence: upload → parse → verify → generate → analyze → validate → export, with versions."""
import uuid
from typing import Literal

from fastapi import APIRouter, Depends, File, Form, HTTPException, Response, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .. import entitlements
from ..ai import provider
from ..db import get_db
from ..models import JobApplication, Resume, ResumeAnalysis, ResumeVersion, User, UserProfile, UserSkill
from ..resume import analysis, parser, render
from ..resume.knowledge import DOC_BY_SLUG, DOCUMENT_TYPES, INDUSTRIES, OCCUPATIONS, recommend_document
from ..resume.schema import ResumeContent
from ..security import get_current_user, rate_limit, sign_file
from ..services import audit
from ..storage import RESUME_TYPES, delete_file, save_upload

router = APIRouter(tags=["resumes"])


def _own(db: Session, user: User, rid: uuid.UUID) -> Resume:
    r = db.get(Resume, rid)
    if not r or r.user_id != user.id:
        raise HTTPException(404, "Resume not found.")
    return r


def _version(db: Session, r: Resume, vid: uuid.UUID) -> ResumeVersion:
    v = db.get(ResumeVersion, vid)
    if not v or v.resume_id != r.id:
        raise HTTPException(404, "Version not found.")
    return v


def version_out(v: ResumeVersion, with_content: bool = True) -> dict:
    d = {"id": str(v.id), "resume_id": str(v.resume_id), "version": v.version, "name": v.name, "template": v.template,
         "source": v.source, "created_at": v.created_at, "has_job_description": bool(v.job_description),
         "linked_application_id": str(v.linked_application_id) if v.linked_application_id else None}
    if with_content:
        d["content"] = v.content
        d["job_description"] = v.job_description
    return d


def resume_out(db: Session, r: Resume, user: User, full: bool = False) -> dict:
    vs = db.scalars(select(ResumeVersion).where(ResumeVersion.resume_id == r.id).order_by(ResumeVersion.version.desc())).all()
    last = db.scalar(select(ResumeAnalysis).where(ResumeAnalysis.resume_id == r.id).order_by(ResumeAnalysis.created_at.desc()))
    d = {"id": str(r.id), "title": r.title, "document_type": r.document_type,
         "document_type_name": DOC_BY_SLUG.get(r.document_type, {}).get("name"), "status": r.status,
         "original_filename": r.original_filename, "created_at": r.created_at, "updated_at": r.updated_at,
         "version_count": len(vs), "latest_version": version_out(vs[0], False) if vs else None,
         "last_score": last.score if last else None,
         "original_url": sign_file("resume", r.id, user.id) if r.original_file_path else None}
    if full:
        d["parsed_content"] = r.parsed_content
        d["versions"] = [version_out(v, False) for v in vs]
        d["analyses"] = [{"id": str(a.id), "type": a.analysis_type, "score": a.score, "created_at": a.created_at,
                          "version_id": str(a.version_id) if a.version_id else None}
                         for a in db.scalars(select(ResumeAnalysis).where(ResumeAnalysis.resume_id == r.id)
                                             .order_by(ResumeAnalysis.created_at.desc()).limit(20))]
    return d


@router.get("/resume-intelligence/document-types")
def document_types():
    return {"document_types": DOCUMENT_TYPES, "industries": [{"slug": s, "name": n} for s, n in INDUSTRIES],
            "templates": [{"slug": "classic", "name": "Classic"}, {"slug": "modern", "name": "Modern"},
                          {"slug": "compact", "name": "Compact"}]}


@router.post("/resume-intelligence/upload", status_code=201)
async def upload(file: UploadFile = File(...), title: str = Form("", max_length=160),
                 user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rate_limit(f"upload:{user.id}", 10, 60)
    key, ctype, _, data = await save_upload(file, f"resumes/{user.id}", RESUME_TYPES, with_bytes=True)
    try:
        text = parser.extract_text(data, ctype)
    except Exception:  # noqa: BLE001 — corrupt or encrypted files
        delete_file(key)
        raise HTTPException(422, "We couldn't read this file. Export it again as a PDF or DOCX and retry.")
    if len(text.strip()) < 50:
        delete_file(key)
        raise HTTPException(422, "This file has almost no readable text (it may be a scanned image). Upload a text-based PDF or DOCX.")
    content, method = parser.parse_resume(text, user.id)
    r = Resume(user_id=user.id, title=title or (file.filename or "Uploaded resume").rsplit(".", 1)[0][:160],
               original_file_path=key, original_filename=(file.filename or "resume")[:255], raw_text=text[:100000],
               parsed_content=content.model_dump(), status="parsed")
    db.add(r)
    db.flush()
    audit(db, user.id, "resume.uploaded", "resume", r.id, method=method)
    db.commit()
    d = resume_out(db, r, user, full=True)
    d["parse_method"] = method
    return d


class ParseIn(BaseModel):
    resume_id: uuid.UUID


@router.post("/resume-intelligence/parse")
def reparse(body: ParseIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    r = _own(db, user, body.resume_id)
    if not r.raw_text:
        raise HTTPException(409, "This resume has no uploaded file to parse.")
    content, method = parser.parse_resume(r.raw_text, user.id)
    r.parsed_content, r.status = content.model_dump(), "parsed"
    db.commit()
    return {**resume_out(db, r, user, full=True), "parse_method": method}


class VerifyIn(BaseModel):
    content: ResumeContent
    title: str | None = Field(None, max_length=160)


@router.put("/resumes/{rid}/verify")
def verify(rid: uuid.UUID, body: VerifyIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """The user confirms the extracted data. Only verified data is used for generation."""
    r = _own(db, user, rid)
    r.parsed_content = body.content.model_dump()
    r.status = "verified"
    if body.title:
        r.title = body.title
    # verified skills feed the shared career profile
    existing = {s.skill.lower() for s in db.scalars(select(UserSkill).where(UserSkill.user_id == user.id))}
    for s in body.content.skills[:40]:
        if s.strip() and s.lower() not in existing:
            db.add(UserSkill(user_id=user.id, skill=s.strip()[:80], verified=True))
            existing.add(s.lower())
    audit(db, user.id, "resume.verified", "resume", r.id)
    db.commit()
    return resume_out(db, r, user, full=True)


class FromProfileIn(BaseModel):
    title: str = Field("My resume", max_length=160)


@router.post("/resumes/from-profile", status_code=201)
def from_profile(body: FromProfileIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    p = db.scalar(select(UserProfile).where(UserProfile.user_id == user.id))
    if not p:
        raise HTTPException(409, "Complete your profile first.")
    skills = [s.skill for s in db.scalars(select(UserSkill).where(UserSkill.user_id == user.id))]
    c = parser.from_profile(p, skills, user.email)
    r = Resume(user_id=user.id, title=body.title, parsed_content=c.model_dump(), status="draft")
    db.add(r)
    db.commit()
    return resume_out(db, r, user, full=True)


class ClassifyIn(BaseModel):
    text: str = Field(min_length=2, max_length=20000)


@router.post("/resume-intelligence/classify-occupation")
def classify(body: ClassifyIn, user: User = Depends(get_current_user)):
    t = body.text.lower()
    scored = []
    for ind, title, soc, keys, docs in OCCUPATIONS:
        s = sum(t.count(k) for k in keys) + (3 if title.lower() in t else 0)
        if s:
            scored.append((s, ind, title, soc, docs))
    scored.sort(reverse=True)
    names = dict(INDUSTRIES)
    return {"matches": [{"occupation": title, "industry": names[ind], "industry_slug": ind, "soc_code": soc,
                         "onet_url": f"https://www.onetonline.org/link/summary/{soc}.00", "recommended_documents": docs,
                         "score": s} for s, ind, title, soc, docs in scored[:5]]}


class RecommendIn(BaseModel):
    occupation: str | None = None
    industry: str | None = None
    seniority: str | None = None
    purpose: Literal["corporate", "startup", "federal", "academic", "internship", "graduate_school", "other"] | None = None
    job_description: str | None = Field(None, max_length=30000)


@router.post("/resume-intelligence/recommend-document")
def recommend(body: RecommendIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    p = db.scalar(select(UserProfile).where(UserProfile.user_id == user.id))
    return recommend_document(body.occupation or (p.target_title or p.current_title if p else None),
                              body.industry or (p.industry if p else None), body.seniority or (p.seniority if p else None),
                              body.purpose, p.profile_type if p else None, body.job_description)


class GenerateIn(BaseModel):
    resume_id: uuid.UUID
    document_type: str = "professional"
    job_description: str | None = Field(None, max_length=30000)
    template: Literal["classic", "modern", "compact"] = "classic"
    name: str | None = Field(None, max_length=160)
    application_id: uuid.UUID | None = None


@router.post("/resume-intelligence/generate", status_code=201)
def generate(body: GenerateIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    r = _own(db, user, body.resume_id)
    if body.document_type not in DOC_BY_SLUG:
        raise HTTPException(422, "Unknown document type.")
    if r.status == "parsed":
        raise HTTPException(409, "Review and confirm the extracted information before generating.")
    entitlements.check(db, user, "resume_generation")
    source = ResumeContent.model_validate(r.parsed_content or {})
    jd = body.job_description
    if body.application_id:
        a = db.get(JobApplication, body.application_id)
        if not a or a.user_id != user.id:
            raise HTTPException(404, "Application not found.")
        jd = jd or a.description
    content, meta = analysis.generate(source, body.document_type, jd, user.id)
    n = (db.scalar(select(func.max(ResumeVersion.version)).where(ResumeVersion.resume_id == r.id)) or 0) + 1
    name = body.name or f"{DOC_BY_SLUG[body.document_type]['name']}" + (" · tailored" if jd else "") + f" v{n}"
    v = ResumeVersion(resume_id=r.id, version=n, name=name[:160], content=content.model_dump(), template=body.template,
                      source="adapted" if jd else "generated", job_description=jd,
                      linked_application_id=body.application_id)
    db.add(v)
    r.document_type = body.document_type
    db.flush()
    if body.application_id:
        a.resume_version_id = v.id
    validation = analysis.validate(content, source, body.document_type, jd)
    entitlements.consume(db, user, "resume_generation")
    audit(db, user.id, "resume.generated", "resume", r.id, version=n, method=meta["method"])
    db.commit()
    return {"version": version_out(v), "meta": meta, "validation": validation}


class AnalyzeIn(BaseModel):
    resume_id: uuid.UUID
    version_id: uuid.UUID | None = None
    job_description: str | None = Field(None, max_length=30000)


@router.post("/resume-intelligence/analyze")
def analyze(body: AnalyzeIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    r = _own(db, user, body.resume_id)
    entitlements.check(db, user, "resume_analysis")
    if body.version_id:
        v = _version(db, r, body.version_id)
        content = ResumeContent.model_validate(v.content)
    else:
        content = ResumeContent.model_validate(r.parsed_content or {})
    res = analysis.analyze(content, body.job_description, r.document_type, user.id)
    a = ResumeAnalysis(resume_id=r.id, version_id=body.version_id, analysis_type="ats" if body.job_description else "quality",
                       job_description=body.job_description, result=res, score=res["score"])
    db.add(a)
    entitlements.consume(db, user, "resume_analysis")
    db.commit()
    return {"id": str(a.id), **res}


class ValidateIn(BaseModel):
    resume_id: uuid.UUID
    version_id: uuid.UUID


@router.post("/resume-intelligence/validate")
def validate(body: ValidateIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    r = _own(db, user, body.resume_id)
    v = _version(db, r, body.version_id)
    source = ResumeContent.model_validate(r.parsed_content or {})
    return analysis.validate(ResumeContent.model_validate(v.content), source, r.document_type, v.job_description)


@router.get("/resume-intelligence/history")
def history(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rs = db.scalars(select(Resume).where(Resume.user_id == user.id).order_by(Resume.updated_at.desc())).all()
    return [resume_out(db, r, user) for r in rs]


@router.get("/resumes/{rid}")
def get_resume(rid: uuid.UUID, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return resume_out(db, _own(db, user, rid), user, full=True)


@router.get("/resumes/{rid}/versions")
def versions(rid: uuid.UUID, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    r = _own(db, user, rid)
    return [version_out(v) for v in db.scalars(select(ResumeVersion).where(ResumeVersion.resume_id == r.id)
                                                 .order_by(ResumeVersion.version.desc()))]


@router.get("/resumes/{rid}/versions/{vid}")
def get_version(rid: uuid.UUID, vid: uuid.UUID, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    r = _own(db, user, rid)
    return version_out(_version(db, r, vid))


class EditIn(BaseModel):
    content: ResumeContent
    name: str | None = Field(None, max_length=160)
    template: Literal["classic", "modern", "compact"] | None = None


@router.post("/resumes/{rid}/versions/{vid}/edit", status_code=201)
def edit_version(rid: uuid.UUID, vid: uuid.UUID, body: EditIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Edits never overwrite history: they create a new version."""
    r = _own(db, user, rid)
    base = _version(db, r, vid)
    n = (db.scalar(select(func.max(ResumeVersion.version)).where(ResumeVersion.resume_id == r.id)) or 0) + 1
    v = ResumeVersion(resume_id=r.id, version=n, name=(body.name or f"{base.name.rsplit(' v', 1)[0]} v{n}")[:160],
                      content=body.content.model_dump(), template=body.template or base.template, source="edited",
                      job_description=base.job_description, linked_application_id=base.linked_application_id)
    db.add(v)
    db.commit()
    return version_out(v)


@router.post("/resumes/{rid}/versions/{vid}/restore", status_code=201)
def restore(rid: uuid.UUID, vid: uuid.UUID, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    r = _own(db, user, rid)
    base = _version(db, r, vid)
    n = (db.scalar(select(func.max(ResumeVersion.version)).where(ResumeVersion.resume_id == r.id)) or 0) + 1
    v = ResumeVersion(resume_id=r.id, version=n, name=f"{base.name.rsplit(' v', 1)[0]} v{n} (restored from v{base.version})"[:160],
                      content=base.content, template=base.template, source="restored", job_description=base.job_description)
    db.add(v)
    db.commit()
    return version_out(v)


@router.get("/resumes/{rid}/compare")
def compare(rid: uuid.UUID, a: uuid.UUID, b: uuid.UUID, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    r = _own(db, user, rid)
    va, vb = _version(db, r, a), _version(db, r, b)
    ca, cb = ResumeContent.model_validate(va.content), ResumeContent.model_validate(vb.content)
    sa, sb = set(ca.skills), set(cb.skills)
    ba = {x for e in ca.experience for x in e.bullets}
    bb = {x for e in cb.experience for x in e.bullets}
    out = {"a": version_out(va, False), "b": version_out(vb, False),
           "skills_added": sorted(sb - sa), "skills_removed": sorted(sa - sb),
           "bullets_added": sorted(bb - ba)[:30], "bullets_removed": sorted(ba - bb)[:30],
           "summary_changed": ca.summary != cb.summary}
    jd = vb.job_description or va.job_description
    if jd:
        out["score_a"] = analysis.analyze(ca, jd, r.document_type)["score"]
        out["score_b"] = analysis.analyze(cb, jd, r.document_type)["score"]
    return out


class ExportIn(BaseModel):
    version_id: uuid.UUID | None = None
    format: Literal["pdf", "docx"] = "pdf"
    template: Literal["classic", "modern", "compact"] | None = None


@router.post("/resumes/{rid}/export")
def export(rid: uuid.UUID, body: ExportIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    r = _own(db, user, rid)
    if body.version_id:
        v = _version(db, r, body.version_id)
        content, template = ResumeContent.model_validate(v.content), body.template or v.template
    else:
        content, template = ResumeContent.model_validate(r.parsed_content or {}), body.template or "classic"
    name = (content.contact.full_name or "resume").replace(" ", "_")
    if body.format == "pdf":
        data, mt = render.to_pdf(content, r.document_type, template), "application/pdf"
    else:
        data = render.to_docx(content, r.document_type, template)
        mt = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    audit(db, user.id, "resume.exported", "resume", r.id, format=body.format)
    db.commit()
    return Response(data, media_type=mt, headers={"Content-Disposition": f'attachment; filename="{name}.{body.format}"'})


@router.delete("/resumes/{rid}")
def delete_resume(rid: uuid.UUID, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    r = _own(db, user, rid)
    if r.original_file_path:
        delete_file(r.original_file_path)
    db.delete(r)
    audit(db, user.id, "resume.deleted", "resume", rid)
    db.commit()
    return {"ok": True}


class CoverIn(BaseModel):
    resume_id: uuid.UUID
    version_id: uuid.UUID | None = None
    job_description: str = Field(min_length=30, max_length=30000)
    company: str | None = Field(None, max_length=200)


class CoverOut(BaseModel):
    letter: str


@router.post("/resume-intelligence/cover-letter")
def cover_letter(body: CoverIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    r = _own(db, user, body.resume_id)
    entitlements.check(db, user, "resume_generation")
    content = ResumeContent.model_validate((_version(db, r, body.version_id).content if body.version_id else r.parsed_content) or {})
    ai = provider.structured("cover_letter", f"Company: {body.company or ''}\nJob description:\n{body.job_description}\n\n"
                                             f"Verified resume data:\n{content.model_dump_json()}", CoverOut, user_id=user.id)
    if ai:
        letter = ai.letter
    else:
        kw = analysis.extract_keywords(body.job_description)
        match = [s for s in content.skills if s.lower() in kw["required"] + kw["preferred"]][:4]
        recent = content.experience[0] if content.experience else None
        letter = (f"Dear Hiring Team{' at ' + body.company if body.company else ''},\n\n"
                  f"I'm writing to apply for the {kw['title'] or 'open'} role. "
                  + (f"In my most recent role as {recent.title} at {recent.company}, " if recent and recent.title else "")
                  + (f"I've worked hands-on with {', '.join(match)}, which your team lists as key requirements. " if match else "")
                  + "\n\n[Add one specific result from your experience that matches this role.]\n\n"
                  f"I'd welcome the chance to discuss how I can contribute.\n\nSincerely,\n{content.contact.full_name}")
    entitlements.consume(db, user, "resume_generation")
    db.commit()
    return {"letter": letter, "method": "ai" if ai else "template"}
