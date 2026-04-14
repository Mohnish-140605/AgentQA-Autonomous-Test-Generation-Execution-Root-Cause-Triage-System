# Executor Agent: Runs generated tests in an isolated subprocess with timeout + coverage measurement

import subprocess
import tempfile
import os
import re
import sys

from utils.helpers import emit_pipeline_log


def run_executor(state: dict) -> dict:
    """Execute each test file in a temporary directory via pytest with coverage."""
    tests = state.get("tests", []) or []
    results = []

    if not tests:
        emit_pipeline_log(state, "No generated tests available for execution.", "system", "Executor")
        return {**state, "results": []}

    with tempfile.TemporaryDirectory(prefix="agentqa_") as tmpdir:
        for i, test in enumerate(tests):
            function_name = str(test.get("function", "func"))
            test_filename = f"test_agentqa_{i}_{function_name}.py"
            test_path = os.path.join(tmpdir, test_filename)

            with open(test_path, "w", encoding="utf-8") as fh:
                fh.write(str(test.get("test_code", "")))

            emit_pipeline_log(
                state,
                f"Writing test file: {test_filename}",
                "system", "Executor", depth=1,
            )
            emit_pipeline_log(
                state,
                f"Running: pytest {test_filename} --tb=short --cov",
                "system", "Executor", depth=1,
            )

            outcome = _run_pytest(test_path, tmpdir)

            results.append({
                "function": test.get("function"),
                "target_file": test.get("target_file"),
                "test_file": test_filename,
                "passed": outcome["passed"],
                "failed": outcome["failed"],
                "errors": outcome["errors"],
                "output": outcome["output"][:600],
                "coverage_pct": outcome["coverage_pct"],
            })

            outcome_type = "success" if outcome["passed"] else "error"
            cov_str = f" | coverage={outcome['coverage_pct']:.1f}%" if outcome["coverage_pct"] >= 0 else ""
            emit_pipeline_log(
                state,
                f"Result: {test_filename} | passed={outcome['passed']} "
                f"failed={outcome['failed']} errors={outcome['errors']}{cov_str}",
                outcome_type, "Executor", depth=1,
            )

            for line in (outcome["output"] or "").splitlines()[:6]:
                emit_pipeline_log(state, line, "info", "Executor", depth=2)

            if outcome["output"] and len(outcome["output"].splitlines()) > 6:
                emit_pipeline_log(state, "...output truncated", "system", "Executor", depth=2)

    return {**state, "results": results}


def _run_pytest(test_path: str, cwd: str) -> dict:
    """
    Execute a single pytest file and capture output + coverage.

    Process:
    1. Run pytest with --tb=short --cov --cov-report=term-missing
    2. Parse pass/fail counts and coverage percentage from output
    3. Handle timeout (30 s) and exceptions gracefully

    Returns a dict with keys: passed, failed, errors, output, coverage_pct
    """
    try:
        proc = subprocess.run(
            [
                sys.executable, "-m", "pytest",
                test_path,
                "--tb=short",
                "-q",
                "--no-header",
                f"--cov={os.path.dirname(test_path)}",
                "--cov-report=term-missing",
                "--cov-report=term",
            ],
            capture_output=True,
            text=True,
            timeout=30,
            cwd=cwd,
        )

        output = (proc.stdout or "") + (proc.stderr or "")
        passed = proc.returncode == 0
        failed = proc.returncode != 0
        errors = output.count("ERROR")
        coverage_pct = _parse_coverage(output)

        return {
            "passed": passed,
            "failed": failed,
            "errors": errors,
            "output": output.strip(),
            "coverage_pct": coverage_pct,
        }

    except subprocess.TimeoutExpired as exp:
        stdout = exp.stdout or "" if isinstance(exp.stdout, str) else ""
        stderr = exp.stderr or "" if isinstance(exp.stderr, str) else ""
        output = str(stdout) + str(stderr)
        return {
            "passed": False,
            "failed": True,
            "errors": 1,
            "output": (output + "\nTimeout after 30s").strip(),
            "coverage_pct": -1.0,
        }

    except Exception as e:
        return {
            "passed": False,
            "failed": True,
            "errors": 1,
            "output": str(e),
            "coverage_pct": -1.0,
        }


def _parse_coverage(output: str) -> float:
    """
    Extract the overall coverage percentage from pytest-cov output.

    Looks for lines like:
      TOTAL    120    45    62%
    or the summary line:
      Coverage: 62%
    Returns -1.0 if not found.
    """
    # coverage.py terminal output — TOTAL line
    match = re.search(r"^TOTAL\s+\d+\s+\d+\s+(\d+)%", output, re.MULTILINE)
    if match:
        return float(match.group(1))

    # Alternative: "X% --- coverage" style
    match = re.search(r"(\d+)%\s+coverage", output, re.IGNORECASE)
    if match:
        return float(match.group(1))

    return -1.0