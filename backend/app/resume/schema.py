from pydantic import BaseModel, Field


class Contact(BaseModel):
    full_name: str = ""
    email: str = ""
    phone: str = ""
    location: str = ""
    linkedin: str = ""
    website: str = ""


class Experience(BaseModel):
    title: str = ""
    company: str = ""
    location: str = ""
    start: str = ""
    end: str = ""
    current: bool = False
    bullets: list[str] = Field(default_factory=list)


class Education(BaseModel):
    degree: str = ""
    field: str = ""
    institution: str = ""
    location: str = ""
    start: str = ""
    end: str = ""
    gpa: str = ""
    honors: str = ""


class Certification(BaseModel):
    name: str = ""
    issuer: str = ""
    date: str = ""


class Project(BaseModel):
    name: str = ""
    description: str = ""
    url: str = ""
    bullets: list[str] = Field(default_factory=list)


class Section(BaseModel):
    title: str = ""
    items: list[str] = Field(default_factory=list)


class ResumeContent(BaseModel):
    contact: Contact = Field(default_factory=Contact)
    headline: str = ""
    summary: str = ""
    experience: list[Experience] = Field(default_factory=list)
    education: list[Education] = Field(default_factory=list)
    skills: list[str] = Field(default_factory=list)
    certifications: list[Certification] = Field(default_factory=list)
    projects: list[Project] = Field(default_factory=list)
    publications: list[str] = Field(default_factory=list)
    awards: list[str] = Field(default_factory=list)
    volunteering: list[str] = Field(default_factory=list)
    languages: list[str] = Field(default_factory=list)
    extra_sections: list[Section] = Field(default_factory=list)


class GeneratedResume(BaseModel):
    content: ResumeContent
    missing_information: list[str] = Field(default_factory=list)
    notes: list[str] = Field(default_factory=list)


class AtsAdvice(BaseModel):
    recommendations: list[str] = Field(default_factory=list)
    missing_qualifications: list[str] = Field(default_factory=list)
    rewrite_suggestions: list[str] = Field(default_factory=list)


def content_text(c: ResumeContent) -> str:
    parts = [c.contact.full_name, c.headline, c.summary]
    for e in c.experience:
        parts += [e.title, e.company, e.location, *e.bullets]
    for ed in c.education:
        parts += [ed.degree, ed.field, ed.institution, ed.honors]
    parts += c.skills
    parts += [f"{x.name} {x.issuer}" for x in c.certifications]
    for p in c.projects:
        parts += [p.name, p.description, *p.bullets]
    parts += c.publications + c.awards + c.volunteering + c.languages
    for s in c.extra_sections:
        parts += [s.title, *s.items]
    return "\n".join(p for p in parts if p)
