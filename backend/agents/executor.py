"""Executor Agent: runs tests with Docker/local fallback and mutation score via mutmut."""

import os
import re
import subprocess
import sys
import tempfile
import uuid
from pathlib import Path

from utils.helpers import emit_pipeline_log


def run_executor(state: dict) -> dict:
    tests = state.get("tests", []) or []
    results = []
    repo_data = state.get("repo_data", {}) or {}

    if not tests:
        emit_pipeline_log(state, "No generated tests available for execution.", "system", "Executor")
        return {**state, "results": [], "mutation_score_pct": -1.0}

    use_docker, docker_reason = _docker_runtime_status()
    runtime = "docker" if use_docker else "local"
    emit_pipeline_log(state, f"Executor runtime selected: {runtime}", "system", "Executor")
    emit_pipeline_log(state, f"Docker status: {docker_reason}", "system", "Executor", depth=1)
    mutation_enabled = _mutation_enabled()
    mutation_reason = _mutation_status_reason(mutation_enabled)
    emit_pipeline_log(
        state,
        f"Mutation testing (mutmut): {'enabled' if mutation_enabled else 'disabled'}",
        "system",
        "Executor",
    )
    emit_pipeline_log(state, f"Mutmut status: {mutation_reason}", "system", "Executor", depth=1)

    with tempfile.TemporaryDirectory(prefix="agentqa_") as tmpdir:
        # Materialize fetched repo code so pytest/mutmut have real source to run against.
        repo_root = os.path.join(tmpdir, "repo")
        # If using Docker execution, keep generated tests under repo_root so we can `docker cp` one folder.
        tests_root = os.path.join(repo_root, "_agentqa_tests") if use_docker else os.path.join(tmpdir, "tests")
        os.makedirs(repo_root, exist_ok=True)
        os.makedirs(tests_root, exist_ok=True)
        _materialize_repo(repo_data, repo_root)
        _write_mutmut_config(repo_data, repo_root)

        # Write all generated tests first so mutation testing can run on full suite.
        test_paths = []
        for i, test in enumerate(tests):
            function_name = str(test.get("function", "func"))
            test_filename = f"test_agentqa_{i}_{function_name}.py"
            test_path = os.path.join(tests_root, test_filename)
            with open(test_path, "w", encoding="utf-8") as fh:
                fh.write(str(test.get("test_code", "")))
            test_paths.append((test, test_filename, test_path))
            emit_pipeline_log(state, f"Prepared test file: {test_filename}", "system", "Executor", depth=1)

        for test, test_filename, test_path in test_paths:
            emit_pipeline_log(state, f"Running tests for: {test_filename}", "system", "Executor", depth=1)
            outcome = _run_pytest(test_path, repo_root, use_docker=use_docker, tests_dir=tests_root)
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
            emit_pipeline_log(
                state,
                f"Result {test_filename}: pass={outcome['passed']} fail={outcome['failed']} "
                f"errors={outcome['errors']} cov={outcome['coverage_pct']}",
                outcome_type, "Executor", depth=1,
            )

        mutation_score = -1.0
        if mutation_enabled:
            mutation_score = _run_mutmut_score(repo_root, use_docker=use_docker)
        if mutation_score >= 0:
            emit_pipeline_log(state, f"Mutation score (mutmut): {mutation_score:.1f}%", "success", "Executor", depth=1)
        else:
            emit_pipeline_log(state, "Mutation score unavailable (mutmut run failed/skipped).", "warning", "Executor", depth=1)

    return {
        **state,
        "results": results,
        "mutation_score_pct": mutation_score,
        "executor_meta": {
            "runtime": runtime,
            "docker_enabled": os.getenv("AGENTQA_DOCKER_EXEC", "1").strip(),
            "docker_available": use_docker,
            "docker_reason": docker_reason,
            "mutation_enabled": mutation_enabled,
            "mutation_reason": mutation_reason,
        },
    }


def _run_pytest(test_path: str, cwd: str, use_docker: bool = False, tests_dir: str | None = None) -> dict:
    """
    Execute a single pytest file and capture output + coverage.

    Process:
    1. Run pytest with --tb=short --cov --cov-report=term-missing
    2. Parse pass/fail counts and coverage percentage from output
    3. Handle timeout (30 s) and exceptions gracefully

    Returns a dict with keys: passed, failed, errors, output, coverage_pct
    """
    try:
        env = os.environ.copy()
        # Ensure repo root and generated tests are importable.
        if tests_dir:
            env["PYTHONPATH"] = os.pathsep.join([cwd, tests_dir, env.get("PYTHONPATH", "")]).strip(os.pathsep)
        else:
            env["PYTHONPATH"] = os.pathsep.join([cwd, env.get("PYTHONPATH", "")]).strip(os.pathsep)

        if use_docker:
            # Run in a disposable Docker container; copy repo contents into it.
            output, rc = _docker_exec_repo(
                repo_root=cwd,
                sh_cmd=(
                    "pip install -q pytest pytest-cov mutmut >/dev/null 2>&1 && "
                    f"pytest '/work/{os.path.basename(tests_dir)}/{os.path.basename(test_path)}' "
                    "--tb=short -q --no-header "
                    "--cov=/work --cov-report=term-missing --cov-report=term"
                ),
                timeout_s=240,
            )
            passed = rc == 0
            failed = rc != 0
            errors = output.count("ERROR")
            coverage_pct = _parse_coverage(output)
            return {
                "passed": passed,
                "failed": failed,
                "errors": errors,
                "output": output.strip(),
                "coverage_pct": coverage_pct,
            }
        else:
            cmd = [
                sys.executable, "-m", "pytest",
                test_path,
                "--tb=short",
                "-q",
                "--no-header",
                f"--cov={cwd}",
                "--cov-report=term-missing",
                "--cov-report=term",
            ]
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=120, cwd=cwd, env=env)

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


def _docker_runtime_status() -> tuple[bool, str]:
    enabled_raw = os.getenv("AGENTQA_DOCKER_EXEC", "1").strip().lower()
    enabled = enabled_raw in {"1", "true", "yes", "on"}
    if not enabled:
        return False, "AGENTQA_DOCKER_EXEC is disabled."
    try:
        proc = subprocess.run(["docker", "--version"], capture_output=True, text=True, timeout=8)
        if proc.returncode == 0:
            return True, (proc.stdout or "Docker CLI available.").strip()
        return False, (proc.stderr or proc.stdout or "Docker command failed.").strip()
    except FileNotFoundError:
        return False, "Docker CLI not found in PATH."
    except Exception as exc:
        return False, f"Docker check failed: {exc}"


def _mutation_enabled() -> bool:
    return os.getenv("AGENTQA_ENABLE_MUTATION", "0").strip().lower() in {"1", "true", "yes", "on"}


def _mutation_status_reason(enabled: bool) -> str:
    if not enabled:
        return "AGENTQA_ENABLE_MUTATION is disabled."
    return "Enabled; mutmut will run after pytest execution against the materialized repo."


def _docker_pytest_command(test_path: str, cwd: str, tests_dir: str | None = None) -> list[str]:
    # We avoid bind mounts so Docker execution works even when the backend itself runs in Docker.
    # Strategy:
    # - `docker create` a disposable python container
    # - `docker cp` the materialized repo folder into /work
    # - `docker start -a` to run pytest
    # - remove container
    return ["__agentqa_docker__", "pytest", test_path, cwd]


def _run_mutmut_score(cwd: str, use_docker: bool = False) -> float:
    """Run mutmut and approximate mutation score from summary output."""
    try:
        if use_docker:
            output, _rc = _docker_exec_repo(
                repo_root=cwd,
                sh_cmd="pip install -q pytest mutmut >/dev/null 2>&1 && mutmut run",
                timeout_s=600,
            )
            return _parse_mutmut_score(output)
        elif os.name == "nt":
            # On Windows, mutmut might have multiprocessing issues, but we attempt native execution anyway 
            # since WSL might not have pip/python3 correctly configured in the user's environment.
            proc = subprocess.run([sys.executable, "-m", "mutmut", "run"], capture_output=True, text=True, timeout=240, cwd=cwd)
        else:
            proc = subprocess.run([sys.executable, "-m", "mutmut", "run"], capture_output=True, text=True, timeout=240, cwd=cwd)
        output = (proc.stdout or "") + "\n" + (proc.stderr or "")
        return _parse_mutmut_score(output)
    except Exception:
        return -1.0


def _to_wsl_path(win_path: str) -> str:
    p = Path(win_path).resolve()
    drive = p.drive.rstrip(":").lower()
    unix_tail = str(p).replace("\\", "/").split(":", 1)[-1]
    return f"/mnt/{drive}{unix_tail}"


def _parse_mutmut_score(output: str) -> float:
    """
    Parse mutmut status line like:
    "🎉 8 / 10  🎉"
    Fallback to -1 when unavailable.
    """
    match = re.search(r"(\d+)\s*/\s*(\d+)", output)
    if match:
        killed = int(match.group(1))
        total = int(match.group(2))
        if total > 0:
            return round((killed / total) * 100, 1)
    return -1.0


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


def _materialize_repo(repo_data: dict, repo_root: str) -> None:
    """Write fetched repo files to disk so tools (pytest/mutmut) can operate on real code."""
    files = (repo_data or {}).get("files", []) or []
    for f in files:
        rel = str((f or {}).get("path", "")).strip().lstrip("/").replace("\\", "/")
        if not rel:
            continue
        dest = os.path.join(repo_root, *rel.split("/"))
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        with open(dest, "w", encoding="utf-8") as fh:
            fh.write(str((f or {}).get("content", "")))


def _write_mutmut_config(repo_data: dict, repo_root: str) -> None:
    """
    Create a minimal mutmut config so mutmut knows what to mutate and how to run tests.
    This avoids "no paths to mutate" / empty runs.
    """
    files = (repo_data or {}).get("files", []) or []
    py_paths = []
    for f in files:
        rel = str((f or {}).get("path", "")).strip().lstrip("/").replace("\\", "/")
        if rel.endswith(".py") and rel:
            py_paths.append(rel)
    if not py_paths:
        return

    cfg = os.path.join(repo_root, "setup.cfg")
    if os.path.exists(cfg):
        return

    paths_to_mutate = "\n    ".join(py_paths)
    content = (
        "[mutmut]\n"
        "runner = python -m pytest -q\n"
        "paths_to_mutate =\n"
        f"    {paths_to_mutate}\n"
    )
    with open(cfg, "w", encoding="utf-8") as fh:
        fh.write(content)


def _docker_exec_repo(repo_root: str, sh_cmd: str, timeout_s: int = 240) -> tuple[str, int]:
    """
    Execute a shell command in a fresh python container with repo_root copied into /work.
    Requires Docker daemon access (host docker or mounted /var/run/docker.sock).
    """
    name = f"agentqa-exec-{uuid.uuid4().hex[:10]}"
    created = False
    try:
        create = subprocess.run(
            ["docker", "create", "--name", name, "-w", "/work", "python:3.11-slim", "sh", "-lc", sh_cmd],
            capture_output=True,
            text=True,
            timeout=20,
        )
        if create.returncode != 0:
            raise RuntimeError((create.stderr or create.stdout or "docker create failed").strip())
        created = True

        cp = subprocess.run(
            ["docker", "cp", f"{repo_root}{os.sep}.", f"{name}:/work"],
            capture_output=True,
            text=True,
            timeout=60,
        )
        if cp.returncode != 0:
            raise RuntimeError((cp.stderr or cp.stdout or "docker cp failed").strip())

        run = subprocess.run(
            ["docker", "start", "-a", name],
            capture_output=True,
            text=True,
            timeout=timeout_s,
        )
        out = (run.stdout or "") + "\n" + (run.stderr or "")
        return out, int(run.returncode)
    finally:
        if created:
            subprocess.run(["docker", "rm", "-f", name], capture_output=True, text=True, timeout=20)