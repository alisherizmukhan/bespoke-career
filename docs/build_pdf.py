"""Builds the two PDFs from the Markdown docs in this folder.

    pip install markdown==3.7
    python docs/build_pdf.py

Needs Google Chrome or Microsoft Edge (used headless to print HTML to PDF).
Output: docs/Bespoke-Documentation.pdf (everything) and docs/Bespoke-User-Guide.pdf (section 2 only)."""
import html
import re
import shutil
import subprocess
import sys
import tempfile
from datetime import date
from pathlib import Path

import markdown

DOCS = Path(__file__).resolve().parent
SECTIONS = ["01-overview", "02-user-guide", "03-architecture", "04-backend", "05-frontend", "06-security",
            "07-payments", "08-design", "09-deploy", "10-testing", "11-history-and-defense"]

CSS = """
@page { size: A4; margin: 20mm 17mm 20mm 17mm;
  @bottom-left { content: "Bespoke · %(label)s"; font: 8.5pt 'Segoe UI', Arial, sans-serif; color: #8a857c; }
  @bottom-right { content: counter(page) " / " counter(pages); font: 8.5pt 'Segoe UI', Arial, sans-serif; color: #8a857c; } }
@page :first { margin: 0; @bottom-left { content: none; } @bottom-right { content: none; } }
* { box-sizing: border-box; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 10.5pt; line-height: 1.55; color: #1c1a17; margin: 0; }
.cover { width: 210mm; height: 296mm; display: flex; flex-direction: column; justify-content: space-between; page-break-after: always;
  background: #0b0d14; color: #f2f4f8; margin: 0; padding: 30mm 22mm 24mm; overflow: hidden; }
.cover .mark { display: inline-flex; align-items: center; gap: 10px; font-size: 15pt; font-weight: 600; }
.cover .mark b { display: inline-grid; place-items: center; width: 30px; height: 30px; border-radius: 7px; background: #f2f4f8; color: #0b0d14; font-size: 15pt; }
.cover h1 { border: 0; padding: 0; font-size: 40pt; line-height: 1.05; letter-spacing: -0.02em; margin: 0 0 12px; font-weight: 600; }
.cover .sub { font-size: 14pt; color: #b8bdca; max-width: 150mm; }
.cover .meta { font-family: Consolas, monospace; font-size: 9.5pt; color: #8e95a6; line-height: 1.8; }
.cover .accent { display: inline-block; width: 46px; height: 4px; background: #6c47d9; border-radius: 2px; margin-bottom: 18px; }
.toc { page-break-after: always; }
.toc h2 { border: 0; margin-top: 0; }
.toc ol { list-style: none; padding: 0; margin: 0; }
.toc li { display: flex; gap: 12px; padding: 7px 0; border-bottom: 1px solid #e7e4dd; font-size: 11pt; }
.toc li span { font-family: Consolas, monospace; color: #8a857c; width: 26px; }
.toc a { color: #1c1a17; text-decoration: none; }
.toc .desc { color: #6e6860; font-size: 9.5pt; margin-left: auto; text-align: right; max-width: 85mm; }
section.doc { page-break-before: always; }
section.doc:first-of-type { page-break-before: auto; }
h1 { font-size: 22pt; letter-spacing: -0.01em; margin: 0 0 14px; padding-bottom: 10px; border-bottom: 3px solid #6c47d9; font-weight: 600; }
h2 { font-size: 14.5pt; margin: 22px 0 8px; padding-top: 4px; font-weight: 600; break-after: avoid; }
h3 { font-size: 12pt; margin: 16px 0 6px; font-weight: 600; break-after: avoid; }
h4 { font-size: 11pt; margin: 12px 0 4px; break-after: avoid; }
p { margin: 6px 0; }
ul, ol { margin: 6px 0; padding-left: 20px; }
li { margin: 2px 0; }
a { color: #5634b8; text-decoration: none; }
strong { font-weight: 600; }
code { font-family: Consolas, 'Courier New', monospace; font-size: 9pt; background: #efede8; padding: 1px 4px; border-radius: 3px; }
pre { background: #f4f2ee; border: 1px solid #e4e1da; border-radius: 6px; padding: 9px 11px; font-size: 8.4pt; line-height: 1.4;
  white-space: pre-wrap; word-break: break-word; break-inside: avoid; }
pre code { background: none; padding: 0; font-size: inherit; }
table { width: 100%%; border-collapse: collapse; margin: 8px 0 12px; font-size: 9pt; break-inside: auto; }
thead { display: table-header-group; }
tr { break-inside: avoid; }
th { background: #efede8; text-align: left; font-weight: 600; }
th, td { border: 1px solid #e4e1da; padding: 5px 7px; vertical-align: top; }
td code, th code { font-size: 8.2pt; word-break: break-word; }
blockquote { margin: 10px 0; padding: 8px 12px; background: #efeafc; border-left: 3px solid #6c47d9; border-radius: 4px; color: #2c2640; }
blockquote p { margin: 2px 0; }
hr { border: 0; border-top: 1px solid #e7e4dd; margin: 16px 0; }
"""


def load(name: str) -> str:
    return (DOCS / f"{name}.md").read_text(encoding="utf-8")


_LIST = re.compile(r"^\s*(?:[-*]|\d+\.)\s")


def normalize(md_text: str) -> str:
    """GitHub-style Markdown -> Python-Markdown: 3-space nesting becomes 4, and a list that directly follows a
    paragraph line gets the blank line Python-Markdown needs to recognise it."""
    out: list[str] = []
    in_code = False
    for line in md_text.splitlines():
        if line.lstrip().startswith("```"):
            in_code = not in_code
        if not in_code and re.match(r"^ {3}(?! )", line):
            line = " " + line
        if (not in_code and _LIST.match(line) and out and out[-1].strip()
                and not _LIST.match(out[-1]) and not out[-1].startswith((" ", "|", "#", ">"))):
            out.append("")
        out.append(line)
    return "\n".join(out)


def to_html(md_text: str, anchor_map: dict[str, str]) -> str:
    # Links between files become links inside the single PDF
    for fname, anchor in anchor_map.items():
        md_text = md_text.replace(f"({fname}.md)", f"(#{anchor})")
    return markdown.markdown(normalize(md_text), extensions=["tables", "fenced_code", "sane_lists", "attr_list"])


def first_heading(md_text: str) -> str:
    m = re.search(r"^#\s+(.+)$", md_text, re.M)
    return m.group(1).strip() if m else ""


def cover(title: str, subtitle: str) -> str:
    today = date.today().strftime("%d.%m.%Y")
    return f"""<div class="cover">
  <div class="mark"><b>B</b>bespoke</div>
  <div><span class="accent"></span><h1>{html.escape(title)}</h1><div class="sub">{html.escape(subtitle)}</div></div>
  <div class="meta">Сайт: bespoke-career.vercel.app<br>API: bespoke-api-sbc7.onrender.com<br>Версия документа: {today}</div>
</div>"""


def build(out: Path, title: str, subtitle: str, label: str, names: list[str], with_index: bool) -> None:
    anchors = {n: f"sec-{n}" for n in names}
    parts = [cover(title, subtitle)]
    if with_index:
        intro_md = load("README")
        # Keep the index page's tables (access, numbers) but drop its own section table: the PDF has a real TOC
        intro_md = re.sub(r"## Как читать.*?(?=## Тестовые доступы)", "", intro_md, flags=re.S)
        toc = "".join(
            f'<li><span>{i:02d}</span><a href="#{anchors[n]}">{html.escape(re.sub(r"^\d+\.\s*", "", first_heading(load(n))))}</a></li>'
            for i, n in enumerate(names, 1))
        parts.append(f'<div class="toc"><h2>Содержание</h2><ol>{toc}</ol></div>')
        parts.append(f'<section class="doc" id="intro">{to_html(intro_md, anchors)}</section>')
    for n in names:
        parts.append(f'<section class="doc" id="{anchors[n]}">{to_html(load(n), anchors)}</section>')
    doc = f"""<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>{html.escape(title)}</title>
<style>{CSS % {"label": label}}</style></head><body>{"".join(parts)}</body></html>"""
    browser = next((p for p in [r"C:\Program Files\Google\Chrome\Application\chrome.exe",
                                r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
                                shutil.which("google-chrome") or "", shutil.which("chromium") or ""] if p and Path(p).exists()), None)
    if not browser:
        sys.exit("Chrome or Edge not found")
    with tempfile.TemporaryDirectory() as tmp:
        src = Path(tmp) / "doc.html"
        src.write_text(doc, encoding="utf-8")
        subprocess.run([browser, "--headless=new", "--disable-gpu", "--no-pdf-header-footer", f"--user-data-dir={tmp}/profile",
                        f"--print-to-pdf={out}", src.as_uri()], check=True, capture_output=True, timeout=180)
    print(f"{out.name}: {out.stat().st_size // 1024} KB")


if __name__ == "__main__":
    build(DOCS / "Bespoke-Documentation.pdf", "Bespoke — полная документация проекта",
          "Продукт, архитектура, код, безопасность, оплата, дизайн, деплой, тестирование, история работы и шпаргалка к защите",
          "Документация", SECTIONS, with_index=True)
    build(DOCS / "Bespoke-User-Guide.pdf", "Bespoke — руководство пользователя",
          "Пошагово: каждый сценарий пользователя и администратора, все кнопки, оплата и подписка",
          "Руководство пользователя", ["02-user-guide"], with_index=False)
