# Reporter Agent: Generates final JSON and PDF reports from pipeline results
import json
import os
import datetime

from utils.config import get_gemini_api_key

try:
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
    REPORTLAB_AVAILABLE = True
except Exception:
    REPORTLAB_AVAILABLE = False

    class _FallbackColors:
        @staticmethod
        def HexColor(_: str):
            return "#000000"
    colors = _FallbackColors()

REPORTS_DIR = os.path.join(os.path.dirname(__file__), "..", "reports")
os.makedirs(REPORTS_DIR, exist_ok=True)

# Brand colours (dark navy + gold for research paper screenshots)
NAVY  = colors.HexColor("#0f172a")
GOLD  = colors.HexColor("#f59e0b")
GREEN = colors.HexColor("#16a34a")
RED   = colors.HexColor("#dc2626")
LIGHT = colors.HexColor("#f8fafc")
MUTED = colors.HexColor("#64748b")

PASS_RATE_TARGET = 65.0
COVERAGE_TARGET = 65.0


def run_reporter(state: dict) -> dict:
    """Generate JSON and PDF reports from pipeline results."""
    analysis = state.get("analysis", {})
    results  = state.get("results", [])
    tests    = state.get("tests", [])
    executor_meta = state.get("executor_meta", {}) or {}
    mutation_score = float(state.get("mutation_score_pct", -1.0) or -1.0)
    agent_timings = state.get("agent_timings", {}) or {}

    # ── Summary stats ────────────────────────────────────────────────────────
    passed = sum(1 for r in results if r.get("passed") and not r.get("failed"))
    failed = sum(1 for r in results if r.get("failed"))
    errors = sum(r.get("errors", 0) for r in results)
    total  = len(results)

    # Overall coverage: average of per-test coverage values (ignore -1)
    cov_values = [r.get("coverage_pct", -1) for r in results if r.get("coverage_pct", -1) >= 0]
    overall_coverage = round(sum(cov_values) / len(cov_values), 1) if cov_values else -1.0

    pass_rate = round((passed / total) * 100, 1) if total else 0.0
    coverage_for_score = max(overall_coverage, 0.0)
    pass_benchmark_score = min((pass_rate / PASS_RATE_TARGET) * 100, 100) if PASS_RATE_TARGET > 0 else 0.0
    coverage_benchmark_score = (
        min((coverage_for_score / COVERAGE_TARGET) * 100, 100) if COVERAGE_TARGET > 0 else 0.0
    )
    quality_score = round((pass_benchmark_score * 0.6) + (coverage_benchmark_score * 0.4), 1)
    llm_total = len(tests)
    llm_enhanced = sum(1 for t in tests if t.get("llm_enhanced"))
    llm_failed = sum(1 for t in tests if t.get("llm_error"))
    llm_attempted = llm_enhanced + llm_failed
    llm_utilization_pct = round((llm_enhanced / llm_total) * 100, 1) if llm_total else 0.0
    gemini_configured = bool(get_gemini_api_key())
    if not gemini_configured:
        llm_reason = "Gemini API key is not configured."
    elif llm_attempted == 0 and llm_total == 0:
        llm_reason = "No testable functions were found for LLM enhancement."
    elif llm_attempted == 0:
        llm_reason = "No LLM enhancement attempts were made."
    elif llm_enhanced == 0 and llm_failed > 0:
        llm_reason = "All LLM enhancement calls failed (commonly API rate limit or permission errors)."
    else:
        llm_reason = "LLM enhancement was applied successfully for some generated tests."

    # ── Critical failures ────────────────────────────────────────────────────
    CRITICAL_KEYWORDS = ("importerror", "infinite loop", "modulenotfounderror", "timeout")
    critical_failures = [
        r for r in results
        if not r.get("passed") and any(
            kw in (r.get("triage") or "").lower() or kw in (r.get("output") or "").lower()
            for kw in CRITICAL_KEYWORDS
        )
    ]

    # ── Time Comparison ──────────────────────────────────────────────────────
    # Automated runtime (measured): sum of step durations when available
    per_agent_seconds = {}
    total_agent_seconds = 0.0
    for step, info in agent_timings.items():
        try:
            dur_ms = float((info or {}).get("duration_ms", 0.0) or 0.0)
        except Exception:
            dur_ms = 0.0
        secs = round(dur_ms / 1000.0, 3)
        per_agent_seconds[step] = secs
        total_agent_seconds += secs
    total_agent_seconds = round(total_agent_seconds, 3)

    # Manual-equivalent work model (explicit assumptions, broken down)
    # These are coarse estimates intended for ROI comparison, not billing.
    manual_breakdown = {
        "github_fetch_mins": 2.0,
        "code_analysis_mins": round(max((analysis.get("python_files_analyzed", 0) or 0) * 0.8, 5.0), 1),
        "test_writing_mins": round((llm_total or 0) * 15.0, 1),  # authoring tests + edge cases
        "test_execution_mins": round((llm_total or 0) * 1.5, 1),  # running + fixing env hiccups
        "triage_mins": round(max((failed + errors) * 10.0, 0.0), 1),
        "reporting_mins": 6.0,
    }
    manual_total = round(sum(manual_breakdown.values()), 1)
    agent_measured_mins = round(total_agent_seconds / 60.0, 2) if total_agent_seconds > 0 else round((llm_total or 0) * 0.5, 1)
    time_saved = round(max(manual_total - agent_measured_mins, 0), 1)
    
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
            "mutation_score_pct": mutation_score,
            "quality_score_pct": quality_score,
            "llm_utilization_pct": llm_utilization_pct,
            "llm_tests_total": llm_total,
            "llm_tests_attempted": llm_attempted,
            "llm_tests_enhanced": llm_enhanced,
            "llm_tests_failed": llm_failed,
            "gemini_configured": gemini_configured,
            "llm_usage_reason": llm_reason,
            "executor_runtime": executor_meta.get("runtime", "local"),
            "docker_available": bool(executor_meta.get("docker_available", False)),
            "docker_reason": executor_meta.get("docker_reason", "Docker status not reported."),
            "mutation_enabled": bool(executor_meta.get("mutation_enabled", False)),
            "mutation_reason": executor_meta.get("mutation_reason", "Mutation status not reported."),
            "benchmark": {
                "pass_rate_target_pct": PASS_RATE_TARGET,
                "coverage_target_pct": COVERAGE_TARGET,
                "pass_rate_score_pct": round(pass_benchmark_score, 1),
                "coverage_score_pct": round(coverage_benchmark_score, 1),
            },
            "execution_time": {
                "total_seconds": total_agent_seconds,
                "per_agent_seconds": per_agent_seconds,
            },
            "time_comparison": {
                "manual_estimated_mins": manual_total,
                "agent_measured_mins": agent_measured_mins,
                "time_saved_mins": time_saved,
                "manual_breakdown_mins": manual_breakdown,
                "assumptions": {
                    "test_writing_mins_per_test": 15.0,
                    "test_execution_mins_per_test": 1.5,
                    "triage_mins_per_failure": 10.0,
                    "code_analysis_mins_per_file": 0.8,
                },
            },
            "llm_utilization": {
                "test_generation": f"Gemini API utilized for {llm_enhanced} out of {llm_total} tests.",
                "triage": f"Gemini API used to analyze {failed + errors} failed/error tests.",
                "overall": llm_reason
            }
        },
        "agent_timings": agent_timings,
        "critical_failures": [
            {
                "function": r.get("function"),
                "file":     r.get("target_file"),
                "triage":   r.get("triage"),
                "output":   (r.get("output") or "")[:200],
            }
            for r in critical_failures
        ],
        "bug_solutions": [
            {
                "function": r.get("function"),
                "file": r.get("target_file"),
                "issue_code": ((r.get("triage_meta") or {}).get("code")),
                "reliability_score": ((r.get("triage_meta") or {}).get("reliability_score")),
                "recommendation": ((r.get("triage_meta") or {}).get("fix_recommendation")),
                "fix_steps": ((r.get("triage_meta") or {}).get("fix_steps")) or [],
                "patch_suggestion": ((r.get("triage_meta") or {}).get("patch_suggestion")),
                "triage_summary": r.get("triage"),
            }
            for r in results
            if r.get("failed") or (r.get("errors", 0) > 0)
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

    # ── Generate PDF (optional) ─────────────────────────────────────────────
    pdf_path = os.path.join(REPORTS_DIR, f"report_{ts}.pdf")
    pdf_enabled = os.getenv("AGENTQA_ENABLE_PDF", "1").strip().lower() in {"1", "true", "yes", "on"}
    pdf_error = None
    if REPORTLAB_AVAILABLE and pdf_enabled:
        try:
            _build_pdf(report, pdf_path)
        except Exception as e:
            pdf_error = str(e)
            pdf_path = ""
    else:
        pdf_error = "PDF generation skipped (reportlab unavailable or AGENTQA_ENABLE_PDF disabled)."
        pdf_path = ""

    report["json_path"] = json_path
    report["pdf_path"]  = pdf_path
    report["pdf_available"] = bool(pdf_path)
    report["pdf_note"] = pdf_error

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
    mutation_score = s.get("mutation_score_pct", -1.0)
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
        ["Mutation Score",   f"{mutation_score:.1f}%" if mutation_score >= 0 else "n/a"],
        ["Quality Score",    f'{s.get("quality_score_pct", 0.0)}%'],
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

    # ── LLM Utilization & ROI ────────────────────────────────────────────────
    story.append(Paragraph("LLM Utilization & QA Comparison", s_h2))
    
    time_data = s.get("time_comparison", {})
    llm_util = s.get("llm_utilization", {})
    manual_time = time_data.get("manual_estimated_mins", 0)
    agent_time = time_data.get("agent_measured_mins", time_data.get("agent_estimated_mins", 0))
    saved_time = time_data.get("time_saved_mins", 0)
    
    story.append(Paragraph(f"• <b>Automated AgentQA Time:</b> {agent_time} minutes", s_body))
    story.append(Paragraph(f"• <b>Estimated Manual Time:</b> {manual_time} minutes", s_body))
    story.append(Paragraph(f"• <font color='#16a34a'><b>Time Saved:</b> {saved_time} minutes</font>", s_body))
    story.append(Spacer(1, 0.2*cm))
    
    story.append(Paragraph("<b>LLM Touches:</b>", s_body))
    story.append(Paragraph(f"• {llm_util.get('test_generation', 'N/A')}", s_body))
    story.append(Paragraph(f"• {llm_util.get('triage', 'N/A')}", s_body))
    story.append(Paragraph(f"• Context: {llm_util.get('overall', 'N/A')}", s_body))
    story.append(Spacer(1, 0.2*cm))

    story.append(Paragraph("<b>Docker & Mutmut Utilization:</b>", s_body))
    if s.get("docker_available"):
        story.append(Paragraph("• <b>Docker:</b> Enabled. Code execution ran safely in isolated container environments.", s_body))
    else:
        story.append(Paragraph(f"• <b>Docker:</b> Disabled ({s.get('docker_reason')})", s_body))
        
    if s.get("mutation_enabled"):
        story.append(Paragraph("• <b>Mutmut:</b> Enabled. Mutation testing was employed to ensure test suite robustness.", s_body))
    else:
        story.append(Paragraph(f"• <b>Mutmut:</b> Disabled ({s.get('mutation_reason')})", s_body))
    story.append(Spacer(1, 0.4*cm))

    # ── Execution time by agent ─────────────────────────────────────────────
    exec_time = s.get("execution_time", {}) or {}
    per_agent = exec_time.get("per_agent_seconds", {}) or {}
    if per_agent:
        story.append(Paragraph("Execution time by agent", s_h2))
        # Show up to all agents in order, then any extra keys.
        order = ["GitHub Fetch", "Code Analyst", "Test Writer", "Executor", "Triage", "Reporter"]
        rows = [["Step", "Seconds"]]
        seen = set()
        for k in order:
            if k in per_agent:
                rows.append([k, f"{float(per_agent.get(k) or 0.0):.2f}s"])
                seen.add(k)
        for k, v in per_agent.items():
            if k in seen:
                continue
            try:
                rows.append([str(k), f"{float(v or 0.0):.2f}s"])
            except Exception:
                rows.append([str(k), "—"])
        total_secs = exec_time.get("total_seconds", 0.0) or 0.0
        rows.append(["Total", f"{float(total_secs):.2f}s"])
        t_exec = Table(rows, colWidths=[10*cm, 4*cm])
        t_exec.setStyle(TableStyle([
            ("BACKGROUND",   (0, 0), (-1, 0),  NAVY),
            ("TEXTCOLOR",    (0, 0), (-1, 0),  colors.white),
            ("FONTNAME",     (0, 0), (-1, 0),  "Helvetica-Bold"),
            ("GRID",         (0, 0), (-1, -1), 0.3, colors.HexColor("#cbd5e1")),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, LIGHT]),
            ("PADDING",      (0, 0), (-1, -1), 5),
            ("FONTNAME",     (0, -1), (-1, -1), "Helvetica-Bold"),
            ("BACKGROUND",   (0, -1), (-1, -1), colors.HexColor("#fef3c7")),
        ]))
        story.append(t_exec)
        story.append(Spacer(1, 0.35*cm))

    # ── Manual time breakdown ───────────────────────────────────────────────
    breakdown = time_data.get("manual_breakdown_mins", {}) or {}
    if breakdown:
        story.append(Paragraph("Manual-equivalent time breakdown (estimated)", s_h2))
        rows = [["Activity", "Minutes"]]
        for k, v in breakdown.items():
            label = str(k).replace("_", " ")
            try:
                rows.append([label, f"{float(v):.1f}"])
            except Exception:
                rows.append([label, "—"])
        rows.append(["Total", f"{float(manual_time or 0.0):.1f}"])
        t_man = Table(rows, colWidths=[10*cm, 4*cm])
        t_man.setStyle(TableStyle([
            ("BACKGROUND",   (0, 0), (-1, 0),  NAVY),
            ("TEXTCOLOR",    (0, 0), (-1, 0),  colors.white),
            ("FONTNAME",     (0, 0), (-1, 0),  "Helvetica-Bold"),
            ("GRID",         (0, 0), (-1, -1), 0.3, colors.HexColor("#cbd5e1")),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, LIGHT]),
            ("PADDING",      (0, 0), (-1, -1), 5),
            ("FONTNAME",     (0, -1), (-1, -1), "Helvetica-Bold"),
            ("BACKGROUND",   (0, -1), (-1, -1), colors.HexColor("#fef3c7")),
        ]))
        story.append(t_man)
        story.append(Spacer(1, 0.35*cm))

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

    # ── Actionable bug solutions ──────────────────────────────────────────────
    solutions = report.get("bug_solutions", [])
    if solutions:
        story.append(Paragraph("Recommended Fixes", s_h2))
        for sol in solutions[:20]:
            steps = sol.get("fix_steps") or []
            step_text = "<br/>".join([f"{idx+1}. {st}" for idx, st in enumerate(steps[:3])])
            score = sol.get("reliability_score")
            score_tag = f" | confidence={score}%" if isinstance(score, int) else ""
            patch_text = (sol.get("patch_suggestion") or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
            patch_text = "<br/>".join(patch_text.splitlines()[:10]) if patch_text else "No patch suggestion available."
            story.append(KeepTogether([
                Paragraph(
                    f"<b>{sol.get('function', '?')}</b> ({sol.get('file', '?')}) "
                    f"[{sol.get('issue_code', 'unknown')}] {score_tag}",
                    s_body,
                ),
                Paragraph(sol.get("recommendation") or "No recommendation available.", s_mono),
                Paragraph(step_text or "No fix steps available.", s_small),
                Paragraph(f"<b>Patch draft:</b><br/>{patch_text}", s_small),
                Spacer(1, 0.18*cm),
            ]))

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
