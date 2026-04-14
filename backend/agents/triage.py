# Triage Agent: Analyses test failures and generates structured root-cause explanations
import re
import sys
from typing import Any

from utils.config import get_gemini_api_key
from utils.gemini_client import gemini_chat


def run_triage(state: dict) -> dict:
    """Add triage explanations to each test result and preserve pipeline state."""
    if not isinstance(state, dict):
        raise TypeError("Triage state must be a dict")

    results = state.get("results")
    if not isinstance(results, list):
        results = []

    triaged = []
    for result in results:
        if not isinstance(result, dict):
            continue
        explanation = _explain(result)
        triaged.append({**result, "triage": explanation["text"], "triage_meta": explanation})

    return {**state, "results": triaged}


# ──────────────────────────────────────────────
# Pattern-based explanation (fast, no API call)
# ──────────────────────────────────────────────

def _explain(result: dict) -> dict:
    """Generate structured triage info for a single test result."""
    func = str(result.get("function", "unknown"))
    output = str(result.get("output", ""))
    passed = bool(result.get("passed", False))
    failed = bool(result.get("failed", False))
    errors = _safe_int(result.get("errors", 0))

    if passed and not failed:
        return _explanation("passed", f"All tests for `{func}` passed.", "success")

    # Try to extract the failing line number from the traceback
    failing_line = _extract_failing_line(output)
    line_hint = f" (line {failing_line})" if failing_line else ""

    if "ImportError" in output or "ModuleNotFoundError" in output:
        module_match = re.search(r"No module named '([^']+)'", output)
        mod_name = f" — module '{module_match.group(1)}'" if module_match else ""
        return _explanation(
            "import_error",
            f"`{func}`{line_hint}: Cannot import the target module{mod_name}. "
            "Check the import path and ensure the module is installed or accessible.",
            "error",
        )

    if "AssertionError" in output:
        # Try to pull the specific assert line
        assert_match = re.search(r"assert\s+(.{0,80})", output)
        assert_detail = f" — `{assert_match.group(0).strip()}`" if assert_match else ""
        return _explanation(
            "assertion_error",
            f"`{func}`{line_hint}: Assertion failed{assert_detail}. "
            "The function returned an unexpected value; check expected vs. actual.",
            "warning",
        )

    if "Timeout" in output or "timeout" in output.lower():
        return _explanation(
            "timeout",
            f"`{func}`{line_hint}: Test timed out (>30 s). "
            "The code likely contains an infinite loop or blocking I/O operation.",
            "warning",
        )

    if "TypeError" in output:
        return _explanation(
            "type_error",
            f"`{func}`{line_hint}: TypeError raised. "
            "A function received an argument of the wrong type.",
            "warning",
        )

    if "NameError" in output:
        name_match = re.search(r"name '(.+?)' is not defined", output)
        name_hint = f" — '{name_match.group(1)}'" if name_match else ""
        return _explanation(
            "name_error",
            f"`{func}`{line_hint}: NameError{name_hint}. "
            "A variable or function is referenced before it is defined.",
            "error",
        )

    if errors > 0:
        return _explanation(
            "execution_error",
            f"`{func}`{line_hint}: Test encountered an execution error. "
            "Review the test output and the source code for the root cause.",
            "error",
        )

    if failed:
        # Fall through to LLM if there's output to analyse
        if output.strip():
            llm_text = _llm_explain(func, output, failing_line)
            if llm_text:
                return _explanation("llm_triage", llm_text, "info", llm_used=True)
        return _explanation(
            "failed",
            f"`{func}`{line_hint}: Test failed. Review function logic and expected outputs.",
            "error",
        )

    if output.strip():
        llm_text = _llm_explain(func, output, failing_line)
        if llm_text:
            return _explanation("llm_fallback", llm_text, "info", llm_used=True)

    return _explanation(
        "unclear",
        f"`{func}`: Test outcome unclear. Manual review recommended.",
        "info",
    )


def _extract_failing_line(output: str) -> str | None:
    """Pull the first line number from a traceback."""
    # Matches patterns like: File "test_foo.py", line 42
    match = re.search(r'File "[^"]+", line (\d+)', output)
    if match:
        return match.group(1)
    # Fallback: bare 'line N' mention
    match = re.search(r'\bline (\d+)\b', output)
    return match.group(1) if match else None


def _explanation(code: str, text: str, severity: str, llm_used: bool = False) -> dict:
    return {
        "code": code,
        "text": text,
        "severity": severity,
        "llm_used": bool(llm_used),
    }


def _safe_int(value: Any) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return 0


# ──────────────────────────────────────────────
# Gemini 1.5 Flash root-cause analysis
# ──────────────────────────────────────────────

TRIAGE_SYSTEM_PROMPT = (
    "You are an expert test failure analyst specialising in Python and pytest. "
    "Given a pytest execution output, identify the root cause in 1-2 plain English sentences. "
    "Be specific: mention the exact failing line number if present in the traceback, "
    "the type of error (e.g., ImportError, AssertionError, TypeError), and the likely reason. "
    "Do NOT include code snippets or markdown. Write in plain prose only."
)


def _llm_explain(func: str, output: str, failing_line: str | None) -> str | None:
    """Use Gemini 1.5 Flash to explain a test failure."""
    gemini_key = get_gemini_api_key()
    if not gemini_key or not output.strip():
        return None

    line_context = f"Failing line number extracted from traceback: {failing_line}\n" if failing_line else ""
    user_content = (
        f"Function under test: `{func}`\n"
        f"{line_context}"
        f"Pytest output (truncated to 600 chars):\n{output[:600]}"
    )

    print(f"[TRIAGE] Calling Gemini for: {func} (line={failing_line})", file=sys.stderr)

    try:
        messages = [
            {"role": "system", "content": TRIAGE_SYSTEM_PROMPT},
            {"role": "user", "content": user_content},
        ]
        result = gemini_chat(messages, temperature=0.15, max_tokens=150)
        print(f"[TRIAGE] Gemini response: {len(result)} chars", file=sys.stderr)
        return result
    except Exception as e:
        print(f"[TRIAGE] Gemini call failed: {type(e).__name__}: {e}", file=sys.stderr)
        return None
