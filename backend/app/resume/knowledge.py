"""Industry knowledge: document types, section orders, industries, and the recommendation rules."""

DOCUMENT_TYPES = [
    {"slug": "professional", "name": "Professional Resume", "max_pages": 2,
     "description": "Reverse-chronological resume for most corporate and private-sector roles.",
     "sections": ["summary", "experience", "skills", "education", "certifications", "projects"]},
    {"slug": "ats", "name": "ATS-Friendly Resume", "max_pages": 2,
     "description": "Single-column, plain-formatting resume that applicant tracking systems parse reliably.",
     "sections": ["summary", "skills", "experience", "education", "certifications"]},
    {"slug": "academic_cv", "name": "Academic CV", "max_pages": 10,
     "description": "Full academic record for faculty and academic positions; no page limit.",
     "sections": ["education", "experience", "publications", "projects", "awards", "certifications", "skills", "languages"]},
    {"slug": "research_cv", "name": "Research CV", "max_pages": 6,
     "description": "Emphasizes research projects, publications, grants and methods.",
     "sections": ["summary", "projects", "publications", "education", "experience", "skills", "awards"]},
    {"slug": "teaching_cv", "name": "Teaching CV", "max_pages": 4,
     "description": "Highlights teaching experience, courses, curriculum work and certification.",
     "sections": ["summary", "experience", "education", "certifications", "awards", "skills"]},
    {"slug": "executive", "name": "Executive Resume", "max_pages": 3,
     "description": "Leadership-focused resume emphasizing scope, strategy and business outcomes.",
     "sections": ["summary", "experience", "education", "awards", "certifications", "skills"]},
    {"slug": "medical_cv", "name": "Medical CV", "max_pages": 6,
     "description": "Clinical training, licensure, board certification, rotations and research.",
     "sections": ["education", "certifications", "experience", "publications", "awards", "skills", "languages"]},
    {"slug": "creative", "name": "Creative Resume", "max_pages": 2,
     "description": "Concise resume that points to a portfolio; for design, media and creative roles.",
     "sections": ["summary", "projects", "experience", "skills", "education", "awards"]},
    {"slug": "portfolio", "name": "Portfolio-Oriented Resume", "max_pages": 2,
     "description": "Project-first resume for roles where work samples matter most.",
     "sections": ["summary", "projects", "skills", "experience", "education"]},
    {"slug": "federal", "name": "Federal Resume", "max_pages": 5,
     "description": "USAJOBS-style resume with detailed duties, hours per week and supervisor details.",
     "sections": ["summary", "experience", "education", "certifications", "skills", "awards", "languages"]},
    {"slug": "internship", "name": "Internship Resume", "max_pages": 1,
     "description": "One-page resume for students: education, projects, activities and skills first.",
     "sections": ["education", "projects", "experience", "skills", "volunteering", "awards"]},
    {"slug": "graduate_cv", "name": "Graduate Application CV", "max_pages": 3,
     "description": "For graduate-school applications: academics, research, honors and activities.",
     "sections": ["education", "projects", "publications", "experience", "awards", "volunteering", "skills"]},
]
DOC_BY_SLUG = {d["slug"]: d for d in DOCUMENT_TYPES}

SECTION_LABELS = {
    "summary": "Summary", "experience": "Experience", "education": "Education", "skills": "Skills",
    "certifications": "Certifications & Licenses", "projects": "Projects", "publications": "Publications",
    "awards": "Awards & Honors", "volunteering": "Volunteering & Activities", "languages": "Languages",
}

INDUSTRIES = [
    ("technology", "Technology & Engineering"), ("healthcare", "Healthcare & Medicine"),
    ("academia", "Academia & Education"), ("business", "Business & Management"),
    ("finance", "Finance & Accounting"), ("marketing", "Marketing & Communications"),
    ("creative", "Creative & Design"), ("media", "Media & Entertainment"), ("legal", "Legal"),
    ("science", "Science & Research"), ("architecture", "Architecture & Construction"),
    ("sales", "Sales & Customer Success"), ("hr", "Human Resources"), ("operations", "Operations & Logistics"),
    ("hospitality", "Hospitality & Tourism"), ("public", "Public Sector & Nonprofit"),
    ("trades", "Skilled Trades"), ("agriculture", "Agriculture & Environment"),
]

# A starter occupation set mapped to SOC codes (O*NET). Admins can extend it.
OCCUPATIONS = [
    ("technology", "Software Developer", "15-1252", ["software", "developer", "engineer", "programmer"], ["professional", "ats", "portfolio"]),
    ("technology", "Data Scientist", "15-2051", ["data scientist", "machine learning"], ["professional", "ats", "research_cv"]),
    ("technology", "Information Security Analyst", "15-1212", ["security", "cyber"], ["professional", "ats"]),
    ("technology", "Computer Systems Analyst", "15-1211", ["systems analyst"], ["professional", "ats"]),
    ("healthcare", "Registered Nurse", "29-1141", ["nurse", "rn"], ["professional", "ats", "medical_cv"]),
    ("healthcare", "Physician", "29-1229", ["physician", "doctor", "md"], ["medical_cv"]),
    ("healthcare", "Medical Assistant", "31-9092", ["medical assistant"], ["professional", "ats"]),
    ("academia", "Postsecondary Teacher", "25-1099", ["professor", "lecturer", "faculty"], ["academic_cv", "teaching_cv"]),
    ("academia", "K-12 Teacher", "25-2031", ["teacher"], ["teaching_cv", "professional"]),
    ("business", "Project Manager", "13-1082", ["project manager", "program manager"], ["professional", "ats"]),
    ("business", "Product Manager", "11-2021", ["product manager"], ["professional", "ats"]),
    ("business", "General and Operations Manager", "11-1021", ["general manager", "operations manager"], ["professional", "executive"]),
    ("finance", "Accountant", "13-2011", ["accountant", "cpa"], ["professional", "ats"]),
    ("finance", "Financial Analyst", "13-2051", ["financial analyst"], ["professional", "ats"]),
    ("marketing", "Marketing Manager", "11-2021", ["marketing"], ["professional", "ats", "creative"]),
    ("creative", "Graphic Designer", "27-1024", ["designer", "design"], ["creative", "portfolio"]),
    ("legal", "Lawyer", "23-1011", ["attorney", "lawyer", "counsel"], ["professional"]),
    ("science", "Biological Scientist", "19-1029", ["scientist", "researcher"], ["research_cv", "academic_cv"]),
    ("architecture", "Architect", "17-1011", ["architect"], ["portfolio", "professional"]),
    ("sales", "Sales Representative", "41-4012", ["sales", "account executive"], ["professional", "ats"]),
    ("hr", "Human Resources Specialist", "13-1071", ["hr", "recruiter", "talent"], ["professional", "ats"]),
    ("operations", "Logistician", "13-1081", ["logistics", "supply chain"], ["professional", "ats"]),
    ("hospitality", "Food Service Manager", "11-9051", ["restaurant", "hospitality"], ["professional"]),
    ("public", "Social and Community Service Manager", "11-9151", ["nonprofit", "program director"], ["federal", "professional"]),
    ("trades", "Electrician", "47-2111", ["electrician"], ["professional"]),
    ("agriculture", "Environmental Scientist", "19-2041", ["environmental"], ["research_cv", "professional"]),
]

GUIDELINES = [
    ("convention", None, "professional", "Use reverse-chronological order and keep most resumes to 1-2 pages.", "https://www.bls.gov/careeroutlook/", "government", "high"),
    ("convention", None, None, "Leave out photos, date of birth, marital status and full street address on US resumes.", None, "convention", "high"),
    ("best_practice", None, "ats", "Use a single-column layout with standard section headings (Experience, Education, Skills) so ATS parsers read it.", None, "best_practice", "medium"),
    ("legal", "public", "federal", "Federal resumes should list hours per week, start and end dates (month/year) and duties for each position.", "https://help.usajobs.gov/how-to/account/documents/resume/what-to-include", "government", "high"),
    ("association", "healthcare", "medical_cv", "List medical licenses with state and license number status, and board certifications with dates.", None, "association", "medium"),
    ("convention", "academia", "academic_cv", "Academic CVs have no page limit; list publications in a consistent citation style.", None, "convention", "high"),
    ("best_practice", "technology", None, "Show impact with outcomes (latency, revenue, users) where the numbers are real and known.", None, "best_practice", "medium"),
    ("best_practice", "creative", "creative", "Include a portfolio link near your name; keep visual styling readable and printable.", None, "best_practice", "medium"),
]


def recommend_document(occupation: str | None, industry: str | None, seniority: str | None, purpose: str | None,
                       profile_type: str | None, job_description: str | None = None) -> dict:
    occ = (occupation or "").lower()
    jd = (job_description or "").lower()
    reasons = []
    pick = "professional"
    if purpose in ("internship",) or profile_type in ("student", "high_school"):
        pick, reasons = "internship", ["You're a student or applying for an internship: a one-page education-first resume works best."]
    elif purpose == "graduate_school":
        pick, reasons = "graduate_cv", ["Graduate applications expect an academic CV with research and honors."]
    elif purpose == "federal" or "usajobs" in jd or "gs-" in jd:
        pick, reasons = "federal", ["Federal (USAJOBS) applications require the detailed federal resume format."]
    elif seniority in ("executive",) or any(w in occ for w in ("director", "vp", "chief", "head of")):
        pick, reasons = "executive", ["Senior leadership roles call for an executive resume focused on scope and outcomes."]
    else:
        for ind, title, _soc, keys, docs in OCCUPATIONS:
            if any(k in occ for k in keys) or (industry and industry == ind and not occ):
                pick = docs[0]
                reasons = [f"Common format for {title.lower()} roles."]
                if "ats" in docs and purpose == "corporate":
                    pick = "ats"
                    reasons.append("Large employers screen with applicant tracking systems.")
                break
        else:
            reasons = ["A reverse-chronological professional resume fits most private-sector roles."]
    alternatives = [d["slug"] for d in DOCUMENT_TYPES if d["slug"] != pick][:0]
    for ind, title, _soc, keys, docs in OCCUPATIONS:
        if any(k in occ for k in keys):
            alternatives = [d for d in docs if d != pick]
            break
    doc = DOC_BY_SLUG[pick]
    return {"document_type": pick, "name": doc["name"], "description": doc["description"], "reasons": reasons,
            "alternatives": [{"slug": a, "name": DOC_BY_SLUG[a]["name"]} for a in alternatives]}
