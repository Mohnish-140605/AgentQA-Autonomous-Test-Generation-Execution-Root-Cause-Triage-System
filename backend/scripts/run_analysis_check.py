import json
import sys
import urllib.request
from pathlib import Path


def post_analyze(github_url: str) -> str:
    payload = json.dumps({"github_url": github_url}).encode("utf-8")
    req = urllib.request.Request(
        "http://localhost:8000/analyze",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    return data["job_id"]


def stream_until_done(job_id: str) -> dict:
    url = f"http://localhost:8000/stream/{job_id}"
    last_done = None
    with urllib.request.urlopen(url, timeout=1800) as stream:
        for raw in stream:
            line = raw.decode("utf-8", errors="ignore").strip()
            if not line.startswith("data: "):
                continue
            payload = line[len("data: ") :]
            evt = json.loads(payload)
            print(payload, flush=True)
            if evt.get("type") == "done":
                last_done = evt
                break
            if evt.get("type") == "error":
                raise RuntimeError(f"Pipeline error: {evt}")
    if not last_done:
        raise RuntimeError("Did not receive done event.")
    return last_done


def read_latest_report() -> dict:
    reports_dir = Path(__file__).resolve().parents[1] / "reports"
    latest = sorted(reports_dir.glob("report_*.json"), key=lambda p: p.stat().st_mtime, reverse=True)
    if not latest:
        raise RuntimeError("No report json found.")
    with latest[0].open("r", encoding="utf-8") as fh:
        data = json.load(fh)
    data["_path"] = str(latest[0])
    return data


def main() -> int:
    repo = "https://github.com/pypa/sampleproject"
    if len(sys.argv) > 1:
        repo = sys.argv[1]
    print(f"Starting analysis for: {repo}")
    job_id = post_analyze(repo)
    print(f"JOB_ID={job_id}", flush=True)
    done_evt = stream_until_done(job_id)
    print(f"DONE_EVENT_JOB={done_evt.get('job_id')}", flush=True)
    report = read_latest_report()
    s = report.get("summary", {}) or {}
    print(f"REPORT_PATH={report.get('_path')}")
    print(f"EXECUTOR_RUNTIME={s.get('executor_runtime')}")
    print(f"DOCKER_AVAILABLE={s.get('docker_available')}")
    print(f"MUTATION_ENABLED={s.get('mutation_enabled')}")
    print(f"MUTATION_SCORE_PCT={s.get('mutation_score_pct')}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
