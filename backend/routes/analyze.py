# API routes for code analysis and report generation
import asyncio
import json
import uuid
import os
import time
from queue import Queue, Empty
from fastapi import APIRouter
from fastapi.responses import StreamingResponse, FileResponse
from pydantic import BaseModel

from services.github_service import fetch_repo_structure
from graph.pipeline import get_pipeline
from utils.helpers import emit_pipeline_log

router = APIRouter()

# In-memory job store - maps job_id to job state
_jobs: dict[str, dict] = {}


class AnalyzeRequest(BaseModel):
    github_url: str


@router.post("/analyze")
async def start_analysis(req: AnalyzeRequest):
    # Starts a new analysis job for given GitHub repository
    job_id = str(uuid.uuid4())
    
    _jobs[job_id] = {
        "status": "queued",
        "state": {"step_log": []},
        "events": [],
        "error": None,
    }

    asyncio.create_task(_run_pipeline(job_id, req.github_url))

    return {
        "job_id": job_id,
        "stream_url": f"/stream/{job_id}"
    }


async def _run_pipeline(job_id: str, github_url: str):
    # Executes the full analysis pipeline for a GitHub repository
    import sys
    print(f"[PIPELINE] Starting analysis for: {github_url}", file=sys.stderr)
    _jobs[job_id]["status"] = "running"

    event_queue: Queue = Queue()
    _jobs[job_id]["state"] = {"step_log": [], "_event_queue": event_queue}
    emit_state = {"_event_queue": event_queue}

    try:
        gh_start = time.perf_counter()
        gh_start_ms = int(time.time() * 1000)
        event_queue.put({"type": "step", "data": {"step": "GitHub Fetch", "status": "running"}})
        emit_pipeline_log(emit_state, "Fetching repository structure from GitHub...", "system", "GitHub Fetch")
        print("[PIPELINE] GitHub Fetch: starting", file=sys.stderr)

        loop = asyncio.get_event_loop()
        repo_data = await loop.run_in_executor(None, fetch_repo_structure, github_url)
        print(f"[PIPELINE] GitHub Fetch: completed, error={bool(repo_data.get('error'))}", file=sys.stderr)
        gh_dur_ms = int((time.perf_counter() - gh_start) * 1000)
        gh_end_ms = int(time.time() * 1000)

        if isinstance(repo_data, dict) and repo_data.get("error"):
            error_msg = repo_data.get("error", "Repository fetch failed")
            print(f"[PIPELINE] ERROR: {error_msg}", file=sys.stderr)
            event_queue.put({"type": "step", "data": {"step": "GitHub Fetch", "status": "error", "detail": error_msg}})
            emit_pipeline_log(emit_state, f"GitHub Fetch failed: {error_msg}", "error", "GitHub Fetch")

            job_record = _jobs[job_id]
            job_record["status"] = "error"
            job_record["error"] = error_msg
            job_record["events"] = job_record.get("events", []) + [
                {"type": "step", "data": {"step": "GitHub Fetch", "status": "error", "detail": error_msg}},
                {"type": "log", "data": {"id": "repo-error", "type": "error", "msg": error_msg, "step": "GitHub Fetch", "depth": 0}},
            ]
            return

        event_queue.put({"type": "step", "data": {"step": "GitHub Fetch", "status": "done"}})
        emit_pipeline_log(emit_state, "GitHub repository fetch completed.", "success", "GitHub Fetch")

        initial_state = {
            "repo_data": repo_data,
            "step_log": [],
            "_event_queue": event_queue,
            "agent_timings": {
                "GitHub Fetch": {
                    "started_at_ms": gh_start_ms,
                    "ended_at_ms": gh_end_ms,
                    "duration_ms": gh_dur_ms,
                }
            },
        }

        _jobs[job_id]["state"] = initial_state
        pipeline = get_pipeline()
        print("[PIPELINE] Invoking LangGraph pipeline...", file=sys.stderr)
        future = loop.run_in_executor(None, pipeline.invoke, initial_state)

        while True:
            try:
                event = event_queue.get(timeout=0.1)
            except Empty:
                if future.done():
                    break
                await asyncio.sleep(0.05)
                continue

            if not isinstance(event, dict):
                continue

            if event.get("type") == "step":
                print(f"[PIPELINE] Step event: {event['data'].get('step')} = {event['data'].get('status')}", file=sys.stderr)
            elif event.get("type") == "log":
                print(f"[PIPELINE] Log event: {event['data'].get('msg')}", file=sys.stderr)

            job_record = _jobs[job_id]
            events = job_record.get("events", [])
            events.append(event)
            job_record["events"] = events

            if event.get("type") == "step":
                job_state = job_record.get("state", {})
                step_log = job_state.get("step_log", []) or []
                step_log.append(event["data"])
                job_record["state"] = {**job_state, "step_log": step_log}

        while not event_queue.empty():
            event = event_queue.get_nowait()
            if not isinstance(event, dict):
                continue

            job_record = _jobs[job_id]
            events = job_record.get("events", [])
            events.append(event)
            job_record["events"] = events

            if event.get("type") == "step":
                job_state = job_record.get("state", {})
                step_log = job_state.get("step_log", []) or []
                step_log.append(event["data"])
                job_record["state"] = {**job_state, "step_log": step_log}

        final_state = await future
        print("[PIPELINE] Pipeline completed, generating report", file=sys.stderr)
        _jobs[job_id]["state"] = final_state
        _jobs[job_id]["status"] = "done"
        print("[PIPELINE] Analysis complete", file=sys.stderr)

    except Exception as e:
        print(f"[PIPELINE] EXCEPTION: {type(e).__name__}: {str(e)}", file=sys.stderr)
        job_record = _jobs[job_id]
        job_record["status"] = "error"
        job_record["error"] = str(e)
        event_queue.put({"type": "step", "data": {"step": "GitHub Fetch", "status": "error", "detail": str(e)}})
        emit_pipeline_log(emit_state, f"Pipeline failed: {str(e)}", "error", "GitHub Fetch")

        while not event_queue.empty():
            event = event_queue.get_nowait()
            if not isinstance(event, dict):
                continue
            job_record["events"] = job_record.get("events", []) + [event]

        job_record["events"] = job_record.get("events", []) + [{"type": "error", "detail": str(e)}]


@router.get("/stream/{job_id}")
async def stream_job(job_id: str):
    # Streams real-time progress updates via Server-Sent Events (SSE)
    
    async def event_gen():
        # Generator that yields SSE-formatted progress events
        sent_events = 0
        
        while True:
            job = _jobs.get(job_id)
            if not job:
                yield _sse({"error": "job not found"})
                break

            events = job.get("events", [])
            while sent_events < len(events):
                event = events[sent_events]
                if isinstance(event, dict):
                    yield _sse(event)
                sent_events += 1

            if job["status"] == "done":
                report = (job.get("state") or {}).get("report", {})
                safe_report = {k: v for k, v in report.items() if k != "pdf_path"}
                yield _sse({"type": "done", "report": safe_report, "job_id": job_id})
                break
                
            elif job["status"] == "error":
                yield _sse({"type": "error", "detail": job.get("error", "unknown")})
                break

            # ────────────────────────────────────────────────────────────
            # Job still running - wait before checking again
            # ────────────────────────────────────────────────────────────
            await asyncio.sleep(0.5)

    # Return EventSource stream with proper headers
    return StreamingResponse(
        event_gen(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",          # Don't cache SSE
            "X-Accel-Buffering": "no",            # Disable buffering
        },
    )


@router.get("/report/{job_id}/pdf")
async def download_pdf(job_id: str):
    # Downloads the generated PDF report for a completed analysis job
    job = _jobs.get(job_id)
    if not job or job["status"] != "done":
        return {"error": "Report not ready yet"}
    
    report = (job.get("state") or {}).get("report", {})
    pdf_path = report.get("pdf_path", "")
    
    if not os.path.exists(pdf_path):
        return {"error": "PDF not found"}
    
    return FileResponse(
        pdf_path,
        media_type="application/pdf",
        filename="agentqa_report.pdf"
    )

@router.get("/report/{job_id}/json")
async def download_json(job_id: str):
    # Downloads the generated JSON report for a completed analysis job
    job = _jobs.get(job_id)
    if not job or job["status"] != "done":
        return {"error": "Report not ready yet"}

    report = (job.get("state") or {}).get("report", {})
    json_path = report.get("json_path", "")

    if not json_path or not os.path.exists(json_path):
        return {"error": "JSON not found"}

    return FileResponse(
        json_path,
        media_type="application/json",
        filename="agentqa_report.json"
    )

@router.get("/reports")
async def list_reports():
    """Return a list of saved report JSON files with key metadata."""
    import glob
    reports_dir = os.path.join(os.path.dirname(__file__), "..", "reports")
    pattern     = os.path.join(reports_dir, "report_*.json")
    files       = sorted(glob.glob(pattern), reverse=True)[:50]

    results = []
    for fpath in files:
        try:
            with open(fpath, "r", encoding="utf-8") as fh:
                data = json.load(fh)
            fname    = os.path.basename(fpath)
            pdf_name = fname.replace(".json", ".pdf")
            pdf_url  = f"/reports/{pdf_name}"
            json_url = f"/reports/{fname}"

            results.append({
                "id":           fname.replace("report_", "").replace(".json", ""),
                "repo":         data.get("repo"),
                "generated_at": data.get("generated_at"),
                "summary":      data.get("summary", {}),
                "pdf_url":      pdf_url,
                "json_url":     json_url,
            })
        except Exception:
            continue

    return {"reports": results}


def _sse(data: dict) -> str:
    # Formats data as Server-Sent Event message
    return f"data: {json.dumps(data)}\n\n"
