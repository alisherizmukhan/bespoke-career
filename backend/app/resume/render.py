"""Export ResumeContent to PDF (fpdf2) and DOCX (python-docx) in a few templates."""
import io
import os
import unicodedata

from .knowledge import DOC_BY_SLUG, SECTION_LABELS
from .schema import ResumeContent

VIOLET = (108, 71, 217)
INK = (21, 18, 42)
MUTED = (94, 88, 115)
FONT_DIRS = ["/usr/share/fonts/truetype/dejavu", os.path.join(os.path.dirname(__file__), "fonts")]


def _font_path(name: str) -> str | None:
    for d in FONT_DIRS:
        p = os.path.join(d, name)
        if os.path.exists(p):
            return p
    return None


def _order(c: ResumeContent, document_type: str) -> list[str]:
    order = list(DOC_BY_SLUG.get(document_type, DOC_BY_SLUG["professional"])["sections"])
    for s in SECTION_LABELS:
        if s not in order:
            order.append(s)
    return order


def to_pdf(c: ResumeContent, document_type: str = "professional", template: str = "classic") -> bytes:
    from fpdf import FPDF

    pdf = FPDF(format="Letter")
    pdf.set_margins(18, 16, 18)
    pdf.set_auto_page_break(True, 16)
    regular, bold = _font_path("DejaVuSans.ttf"), _font_path("DejaVuSans-Bold.ttf")
    if regular and bold:
        pdf.add_font("Body", "", regular)
        pdf.add_font("Body", "B", bold)
        fam, clean = "Body", (lambda s: s or "")
    else:  # core fonts are latin-1 only
        fam = "Helvetica"

        def clean(s):
            s = (s or "").replace("•", "-").replace("–", "-").replace("—", "-").replace("’", "'").replace("“", '"').replace("”", '"')
            return unicodedata.normalize("NFKD", s).encode("latin-1", "ignore").decode("latin-1")
    accent = VIOLET if template in ("modern", "classic") else INK
    pdf.add_page()
    pdf.set_text_color(*INK)
    pdf.set_font(fam, "B", 20 if template != "compact" else 17)
    pdf.cell(0, 9, clean(c.contact.full_name or "Your Name"), new_x="LMARGIN", new_y="NEXT")
    if c.headline:
        pdf.set_font(fam, "", 11)
        pdf.set_text_color(*accent)
        pdf.cell(0, 6, clean(c.headline), new_x="LMARGIN", new_y="NEXT")
    contact = "  ·  ".join(x for x in [c.contact.location, c.contact.email, c.contact.phone, c.contact.linkedin,
                                       c.contact.website] if x)
    if contact:
        pdf.set_font(fam, "", 9)
        pdf.set_text_color(*MUTED)
        pdf.multi_cell(0, 5, clean(contact), new_x="LMARGIN", new_y="NEXT")
    gap = 3 if template == "compact" else 5

    def heading(t):
        pdf.ln(gap)
        pdf.set_font(fam, "B", 11)
        pdf.set_text_color(*accent)
        pdf.cell(0, 6, clean(t.upper()), new_x="LMARGIN", new_y="NEXT")
        y = pdf.get_y()
        pdf.set_draw_color(*accent)
        pdf.set_line_width(0.3)
        pdf.line(pdf.l_margin, y, pdf.w - pdf.r_margin, y)
        pdf.ln(1.5)
        pdf.set_text_color(*INK)

    def bullets(items):
        pdf.set_font(fam, "", 10)
        for b in items:
            pdf.set_x(pdf.l_margin + 3)
            pdf.multi_cell(0, 5, clean(f"• {b}"), new_x="LMARGIN", new_y="NEXT")

    def line_with_date(left, right, bold_left=True):
        pdf.set_font(fam, "B" if bold_left else "", 10.5)
        w = pdf.w - pdf.l_margin - pdf.r_margin
        rw = pdf.get_string_width(clean(right)) + 2 if right else 0
        pdf.cell(w - rw, 5.5, clean(left))
        if right:
            pdf.set_font(fam, "", 9.5)
            pdf.set_text_color(*MUTED)
            pdf.cell(rw, 5.5, clean(right), align="R")
            pdf.set_text_color(*INK)
        pdf.ln(5.5)

    for s in _order(c, document_type):
        if s == "summary" and c.summary:
            heading(SECTION_LABELS[s])
            pdf.set_font(fam, "", 10)
            pdf.multi_cell(0, 5, clean(c.summary), new_x="LMARGIN", new_y="NEXT")
        elif s == "experience" and c.experience:
            heading(SECTION_LABELS[s])
            for e in c.experience:
                dates = " – ".join(x for x in [e.start, "Present" if e.current else e.end] if x)
                line_with_date(e.title or e.company, dates)
                sub = " · ".join(x for x in [e.company if e.title else "", e.location] if x)
                if sub:
                    pdf.set_font(fam, "", 9.5)
                    pdf.set_text_color(*MUTED)
                    pdf.cell(0, 5, clean(sub), new_x="LMARGIN", new_y="NEXT")
                    pdf.set_text_color(*INK)
                bullets(e.bullets)
                pdf.ln(1.5)
        elif s == "education" and c.education:
            heading(SECTION_LABELS[s])
            for e in c.education:
                deg = ", ".join(x for x in [e.degree, e.field] if x)
                line_with_date(deg or e.institution, " – ".join(x for x in [e.start, e.end] if x))
                sub = " · ".join(x for x in [e.institution if deg else "", e.location,
                                             f"GPA {e.gpa}" if e.gpa else "", e.honors] if x)
                if sub:
                    pdf.set_font(fam, "", 9.5)
                    pdf.set_text_color(*MUTED)
                    pdf.cell(0, 5, clean(sub), new_x="LMARGIN", new_y="NEXT")
                    pdf.set_text_color(*INK)
        elif s == "skills" and c.skills:
            heading(SECTION_LABELS[s])
            pdf.set_font(fam, "", 10)
            pdf.multi_cell(0, 5, clean(" · ".join(c.skills)), new_x="LMARGIN", new_y="NEXT")
        elif s == "certifications" and c.certifications:
            heading(SECTION_LABELS[s])
            bullets([" — ".join(x for x in [ce.name, ce.issuer, ce.date] if x) for ce in c.certifications])
        elif s == "projects" and c.projects:
            heading(SECTION_LABELS[s])
            for p in c.projects:
                line_with_date(p.name, p.url)
                if p.description:
                    pdf.set_font(fam, "", 10)
                    pdf.multi_cell(0, 5, clean(p.description), new_x="LMARGIN", new_y="NEXT")
                bullets(p.bullets)
        elif s in ("publications", "awards", "volunteering", "languages") and getattr(c, s):
            heading(SECTION_LABELS[s])
            bullets(getattr(c, s))
    for sec in c.extra_sections:
        if sec.items:
            heading(sec.title or "Additional")
            bullets(sec.items)
    return bytes(pdf.output())


def to_docx(c: ResumeContent, document_type: str = "professional", template: str = "classic") -> bytes:
    import docx
    from docx.enum.text import WD_ALIGN_PARAGRAPH
    from docx.shared import Pt, RGBColor

    d = docx.Document()
    st = d.styles["Normal"]
    st.font.name = "Calibri"
    st.font.size = Pt(10.5)
    accent = RGBColor(*VIOLET)
    h = d.add_paragraph()
    r = h.add_run(c.contact.full_name or "Your Name")
    r.bold, r.font.size = True, Pt(20)
    if c.headline:
        p = d.add_paragraph()
        rr = p.add_run(c.headline)
        rr.font.color.rgb = accent
    contact = "  ·  ".join(x for x in [c.contact.location, c.contact.email, c.contact.phone, c.contact.linkedin,
                                       c.contact.website] if x)
    if contact:
        d.add_paragraph(contact)

    def heading(t):
        p = d.add_paragraph()
        p.paragraph_format.space_before = Pt(10)
        rr = p.add_run(t.upper())
        rr.bold, rr.font.size, rr.font.color.rgb = True, Pt(11), accent

    def bullets(items):
        for b in items:
            d.add_paragraph(b, style="List Bullet")

    def dated(left, right):
        p = d.add_paragraph()
        a = p.add_run(left)
        a.bold = True
        if right:
            p.add_run(f"    {right}").font.color.rgb = RGBColor(*MUTED)
        p.alignment = WD_ALIGN_PARAGRAPH.LEFT

    for s in _order(c, document_type):
        if s == "summary" and c.summary:
            heading(SECTION_LABELS[s])
            d.add_paragraph(c.summary)
        elif s == "experience" and c.experience:
            heading(SECTION_LABELS[s])
            for e in c.experience:
                dated(" — ".join(x for x in [e.title, e.company] if x),
                      " – ".join(x for x in [e.start, "Present" if e.current else e.end] if x))
                if e.location:
                    d.add_paragraph(e.location)
                bullets(e.bullets)
        elif s == "education" and c.education:
            heading(SECTION_LABELS[s])
            for e in c.education:
                dated(", ".join(x for x in [e.degree, e.field] if x) or e.institution,
                      " – ".join(x for x in [e.start, e.end] if x))
                sub = " · ".join(x for x in [e.institution, e.location, f"GPA {e.gpa}" if e.gpa else "", e.honors] if x)
                if sub:
                    d.add_paragraph(sub)
        elif s == "skills" and c.skills:
            heading(SECTION_LABELS[s])
            d.add_paragraph(" · ".join(c.skills))
        elif s == "certifications" and c.certifications:
            heading(SECTION_LABELS[s])
            bullets([" — ".join(x for x in [ce.name, ce.issuer, ce.date] if x) for ce in c.certifications])
        elif s == "projects" and c.projects:
            heading(SECTION_LABELS[s])
            for p in c.projects:
                dated(p.name, p.url)
                if p.description:
                    d.add_paragraph(p.description)
                bullets(p.bullets)
        elif s in ("publications", "awards", "volunteering", "languages") and getattr(c, s):
            heading(SECTION_LABELS[s])
            bullets(getattr(c, s))
    for sec in c.extra_sections:
        if sec.items:
            heading(sec.title or "Additional")
            bullets(sec.items)
    buf = io.BytesIO()
    d.save(buf)
    return buf.getvalue()
