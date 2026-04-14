# Reporter Agent: Generates final JSON and PDF reports from pipeline results
import json
import os
import datetime

from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    HRFlowable, KeepTogether, PageBreak
)
from reportlab.lib import colors
from reportlab.lib.units import cm
from reportlab.graphics.shapes import Drawing, Rect, String
from reportlab.graphics import renderPDF

REPORTS_DIR = os.path.join(os.path.dirname(__file__), "..", "reports")
os.makedirs(REPORTS_DIR, exist_ok=True)

# Brand colours (dark navy + gold for research paper screenshots)
NAVY  = colors.HexColor("#0f172a")
GOLD  = colors.HexColor("#f59e0b")
GREEN = colors.HexColor("#16a34a")
RED   = colors.HexColor("#dc2626")
LIGHT = colors.HexColor("#f8fafc")
MUTED = colors.HexColor("#64748b")


def run_reporter(state: dict) -> dict:
    """Generate JSON and PDF reports from pipeline results."""
    analysis = state.get("analysis", {})
    results  = state.get("results", [])
    tests    = state.get("tests", [])

    # ── Summary stats ────────────────────────────────────────────────────────
    passed = sum(1 for r in results if r.get("passed") and not r.get("failed"))
    failed = sum(1 for r in results if r.get("failed"))
    errors = sum(r.get("errors", 0) for r in results)
    total  = len(results)

    # Overall coverage: average of per-test coverage values (ignore -1)
    cov_values = [r.get("coverage_pct", -1) for r in results if r.get("coverage_pct", -1) >= 0]
    overall_coverage = round(sum(cov_values) / len(cov_values), 1) if cov_values else -1.0

    pass_rate = round((passed / total) * 100, 1) if total else 0.0

    # ── Critical failures ────────────────────────────────────────────────────
    CRITICAL_KEYWORDS = ("importerror", "infinite loop", "modulenotfounderror", "timeout")
    critical_failures = [
        r for r in results
        if not r.get("passed") and any(
            kw in (r.get("triage") or "").lower() or kw in (r.get("output") or "").lower()
            for kw in CRITICAL_KEYWORDS
        )
    ]

    # ── Report structure ─────────────────────────────────────────────────────
    report = {
        "generated_at": datetime.datetime.utcnow().isoformat() + "Z",
        "repo": analysis.get("repo", "unknown"),
        "summary": {
            "files_analyzed":   analysis.get("python_files_analyzed", 0),
            "total_py_files":   analysis.get("total_py_files", 0),
            "tests_generated":  len(tests),
            "passed":           passed,
            "failed":           failed,
            "errors":           errors,
            "pass_rate":        pass_rate,
            "coverage_pct":     overall_coverage,
        },
        "critical_failures": [
            {
                "function": r.get("function"),
                "file":     r.get("target_file"),
                "triage":   r.get("triage"),
                "output":   (r.get("output") or "")[:200],
            }
            for r in critical_failures
        ],
        "modules":      analysis.get("modules", []),
        "tests_metadata": [
            {
                "function": t.get("function"),
                "llm_enhanced": t.get("llm_enhanced", False),
                "llm_error": t.get("llm_error")
            }
            for t in tests
        ],
        "test_results": results,
    }

    # ── Persist JSON ─────────────────────────────────────────────────────────
    ts = datetime.datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    json_path = os.path.join(REPORTS_DIR, f"report_{ts}.json")
    with open(json_path, "w", encoding="utf-8") as fh:
        json.dump(report, fh, indent=2, default=str)

    # ── Generate PDF ─────────────────────────────────────────────────────────
    pdf_path = os.path.join(REPORTS_DIR, f"report_{ts}.pdf")
    _build_pdf(report, pdf_path)

    report["json_path"] = json_path
    report["pdf_path"]  = pdf_path

    return {**state, "report": report}


# ─────────────────────────────────────────────────────────────────────────────
# PDF builder
# ─────────────────────────────────────────────────────────────────────────────

def _build_pdf(report: dict, path: str):
    doc = SimpleDocTemplate(
        path, pagesize=A4,
        rightMargin=2*cm, leftMargin=2*cm,
        topMargin=2*cm, bottomMargin=2*cm,
    )

    styles  = getSampleStyleSheet()
    s_title = ParagraphStyle("title",  parent=styles["Heading1"], fontSize=22,
                              textColor=NAVY, spaceAfter=4, leading=26)
    s_h2    = ParagraphStyle("h2",    parent=styles["Heading2"], fontSize=13,
                              textColor=NAVY, spaceBefore=14, spaceAfter=6)
    s_body  = ParagraphStyle("body",  parent=styles["Normal"],   fontSize=9,
                              leading=13)
    s_mono  = ParagraphStyle("mono",  parent=styles["Code"],     fontSize=7.5,
                              leading=11, textColor=colors.HexColor("#334155"))
    s_small = ParagraphStyle("small", parent=styles["Normal"],   fontSize=7.5,
                              textColor=MUTED)

    s   = report["summary"]
    total = (s["passed"] or 0) + (s["failed"] or 0)
    pass_rate = s.get("pass_rate", 0.0)
    cov       = s.get("coverage_pct", -1.0)
    modules   = report.get("modules", [])

    story = []

    # ── Header ───────────────────────────────────────────────────────────────
    story.append(Paragraph("AgentQA Analysis Report", s_title))
    story.append(Paragraph(f"Repository: <b>{report['repo']}</b>", s_body))
    story.append(Paragraph(f"Generated:  {report['generated_at']}", s_small))
    story.append(Spacer(1, 0.3*cm))
    story.append(HRFlowable(width="100%", thickness=1, color=GOLD, spaceAfter=8))

    # ── Summary table ────────────────────────────────────────────────────────
    story.append(Paragraph("Summary", s_h2))
    
    if s["tests_generated"] == 0:
        story.append(Paragraph(
            "<b><font color='#dc2626'>NOTE: No tests were generated.</font></b> "
            "This usually happens because the repository contains no <b>.py</b> files, or the Python "
            "files found do not contain any parseable functions.", s_body
        ))
        story.append(Spacer(1, 0.2*cm))

    cov_str = f"{cov:.1f}%" if cov >= 0 else "n/a"
    table_data = [
        ["Metric",           "Value"],
        ["Python Files Bound", str(s.get("total_py_files", 0))],
        ["Files Analyzed",   str(s["files_analyzed"])],
        ["Tests Generated",  str(s["tests_generated"])],
        ["Passed",           str(s["passed"])],
        ["Failed",           str(s["failed"])],
        ["Errors",           str(s["errors"])],
        ["Pass Rate",        f"{pass_rate}%"],
        ["Avg Coverage",     cov_str],
    ]
    t = Table(table_data, colWidths=[9*cm, 5*cm])
    t.setStyle(TableStyle([
        ("BACKGROUND",   (0, 0), (-1, 0),  NAVY),
        ("TEXTCOLOR",    (0, 0), (-1, 0),  colors.white),
        ("FONTNAME",     (0, 0), (-1, 0),  "Helvetica-Bold"),
        ("FONTSIZE",     (0, 0), (-1, -1), 9),
        ("GRID",         (0, 0), (-1, -1), 0.4, colors.HexColor("#cbd5e1")),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, LIGHT]),
        ("PADDING",      (0, 0), (-1, -1), 5),
        # Highlight pass rate row gold if > 60 %
        *([("BACKGROUND", (0, 7), (-1, 7), colors.HexColor("#fef3c7"))]
          if pass_rate >= 60 else []),
    ]))
    story.append(t)
    story.append(Spacer(1, 0.4*cm))

    # ── Pass-rate bar ────────────────────────────────────────────────────────
    if s["tests_generated"] > 0:
        story.append(Paragraph("Pass Rate", s_h2))
        bar_w = 420
        bar_h = 18
        filled = int(bar_w * (pass_rate / 100))
        bar_color = GREEN if pass_rate >= 60 else (GOLD if pass_rate >= 30 else RED)

        d = Drawing(bar_w, bar_h + 4)
        # background track
        d.add(Rect(0, 2, bar_w, bar_h, fillColor=colors.HexColor("#e2e8f0"), strokeColor=None))
        # filled portion
        if filled > 0:
            d.add(Rect(0, 2, filled, bar_h, fillColor=bar_color, strokeColor=None))
        # label
        label_x = max(filled + 4, 6)
        d.add(String(label_x, 6, f"{pass_rate}%", fontSize=9, fillColor=colors.black))
        story.append(d)
        story.append(Spacer(1, 0.5*cm))

    # ── Code Analysis & Test Writer Diagnostics ──────────────────────────────
    story.append(Paragraph("Code Analysis Profile", s_h2))
    if not modules:
        story.append(Paragraph("No parseable Python modules found. Ensure the repository contains standard .py files.", s_body))
    else:
        for mod in modules:
            funcs = mod.get("functions", [])
            classes = mod.get("classes", [])
            story.append(Paragraph(f"<b>📄 {mod.get('path')}</b> — {mod.get('loc')} lines", s_body))
            stats = f"• {len(funcs)} functions, {len(classes)} classes found."
            story.append(Paragraph(stats, s_small))
            story.append(Spacer(1, 0.15*cm))
            
    story.append(Spacer(1, 0.3*cm))

    test_meta = report.get("tests_metadata", [])
    if any(t.get("llm_error") for t in test_meta):
        story.append(Paragraph("⚠ Test Generation LLM Errors", s_h2))
        story.append(Paragraph(
            "Some test cases could not be fully augmented with Gemini due to the following API errors. "
            "AgentQA gracefully fell back to producing basic unit test stubs for these functions.", s_body
        ))
        for t in test_meta:
            if t.get("llm_error"):
                story.append(KeepTogether([
                    Paragraph(f"<b>Function:</b> `{t['function']}`", s_mono),
                    Paragraph(f"<font color='#dc2626'>Error: {t['llm_error']}</font>", s_mono),
                    Spacer(1, 0.15*cm)
                ]))
    
    # ── Critical failures ─────────────────────────────────────────────────────
    critical = report.get("critical_failures", [])
    if critical:
        story.append(Paragraph("⚠ Critical Failures", s_h2))
        for cf in critical:
            story.append(KeepTogether([
                Paragraph(
                    f'<font color="#dc2626"><b>✗ {cf["function"]}</b></font>'
                    f' — {cf["file"]}',
                    s_body,
                ),
                Paragraph(f'<i>{cf["triage"] or "No triage available"}</i>', s_mono),
                Spacer(1, 0.2*cm),
            ]))
        story.append(Spacer(1, 0.2*cm))

    # ── Test results ──────────────────────────────────────────────────────────
    if report["test_results"]:
        story.append(PageBreak())
        story.append(Paragraph("Test Execution Logs (up to 30)", s_h2))
        for r in report["test_results"][:30]:
            ok      = r.get("passed") and not r.get("failed")
            status  = "✓ PASSED" if ok else "✗ FAILED"
            sc      = "#16a34a" if ok else "#dc2626"
            cov_r   = r.get("coverage_pct", -1)
            cov_tag = f" | cov={cov_r:.1f}%" if cov_r >= 0 else ""

            story.append(KeepTogether([
                Paragraph(
                    f'<font color="{sc}"><b>{status}</b></font>'
                    f' — {r.get("function", "?")} ({r.get("target_file", "?")}){cov_tag}',
                    s_body,
                ),
                Paragraph(
                    f'<i>{r.get("triage") or "No triage note."}</i>',
                    s_mono,
                ),
                Spacer(1, 0.18*cm),
            ]))

    doc.build(story)
