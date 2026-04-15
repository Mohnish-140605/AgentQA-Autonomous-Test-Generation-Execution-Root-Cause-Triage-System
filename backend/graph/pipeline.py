# LangGraph pipeline orchestration for analysis workflow
import asyncio
import time
import uuid
import sys
from typing import TypedDict
from queue import Queue

from langgraph.graph import StateGraph, END, START

from agents.code_analyst import run_code_analyst
from agents.test_writer import run_test_writer
from agents.executor import run_executor
from agents.triage import run_triage
from agents.reporter import run_reporter


class AgentQAState(TypedDict, total=False):
    # LangGraph state for analysis pipeline
    repo_data: dict       # GitHub files
    analysis: dict        # Code structure
    tests: list           # Generated tests
    results: list         # Execution results with triage
    report: dict          # Final report
    step_log: list        # Progress tracking for SSE
    error: str            # Error messages
    _event_queue: Queue   # Internal queue for real-time SSE events
    agent_timings: dict   # step_name -> {duration_ms, started_at_ms, ended_at_ms}


# ────────────────────────────────────────────────────────────────────────
# Agent wrapper — emits "running" event BEFORE executing, "done" AFTER
# Uses a shared event_queue so the SSE route can stream in real-time
# ────────────────────────────────────────────────────────────────────────
def _wrap(agent_fn, step_name: str):
    """Wraps agent function to push real-time progress into a queue."""
    def wrapper(state: AgentQAState) -> AgentQAState:
        print(f"[AGENT] {step_name}: starting", file=sys.stderr)
        q: Queue = state.get("_event_queue")

        log = list(state.get("step_log", []))
        timings = dict(state.get("agent_timings", {}) or {})
        start_ms = int(time.time() * 1000)
        perf_start = time.perf_counter()

        # Emit RUNNING immediately before work starts
        running_entry = {"step": step_name, "status": "running"}
        log.append(running_entry)
        state = {**state, "step_log": log, "agent_timings": timings}
        if q:
            q.put({"type": "step", "data": {"step": step_name, "status": "running"}})
            q.put({
                "type": "log",
                "data": {
                    "id": str(uuid.uuid4()),
                    "type": "system",
                    "msg": f"{step_name} started...",
                    "step": step_name,
                    "depth": 0,
                },
            })

        try:
            print(f"[AGENT] {step_name}: executing agent function", file=sys.stderr)
            state = agent_fn(state)
            print(f"[AGENT] {step_name}: completed successfully", file=sys.stderr)
            log[-1]["status"] = "done"
            duration_ms = int((time.perf_counter() - perf_start) * 1000)
            end_ms = int(time.time() * 1000)
            timings[step_name] = {
                "started_at_ms": start_ms,
                "ended_at_ms": end_ms,
                "duration_ms": duration_ms,
            }
            if q:
                q.put({"type": "step", "data": {"step": step_name, "status": "done"}})
                q.put({
                    "type": "log",
                    "data": {
                        "id": str(uuid.uuid4()),
                        "type": "success",
                        "msg": f"{step_name} completed.",
                        "step": step_name,
                        "depth": 0,
                    },
                })
        except Exception as e:
            print(f"[AGENT] {step_name}: FAILED: {type(e).__name__}: {str(e)}", file=sys.stderr)
            log[-1]["status"] = "error"
            log[-1]["detail"] = str(e)
            duration_ms = int((time.perf_counter() - perf_start) * 1000)
            end_ms = int(time.time() * 1000)
            timings[step_name] = {
                "started_at_ms": start_ms,
                "ended_at_ms": end_ms,
                "duration_ms": duration_ms,
                "status": "error",
                "detail": str(e),
            }
            state = {**state, "step_log": log, "error": str(e), "agent_timings": timings}
            if q:
                q.put({"type": "step", "data": {"step": step_name, "status": "error", "detail": str(e)}})
                q.put({
                    "type": "log",
                    "data": {
                        "id": str(uuid.uuid4()),
                        "type": "error",
                        "msg": f"{step_name} failed: {str(e)}",
                        "step": step_name,
                        "depth": 0,
                    },
                })

        return {**state, "agent_timings": timings}

    return wrapper


# ────────────────────────────────────────────────────────────────────────
# Build the LangGraph StateGraph
# ────────────────────────────────────────────────────────────────────────
def build_graph() -> StateGraph:
    """Constructs LangGraph StateGraph with all agents."""
    graph = StateGraph(AgentQAState)

    graph.add_node("code_analyst", _wrap(run_code_analyst, "Code Analyst"))
    graph.add_node("test_writer",  _wrap(run_test_writer,  "Test Writer"))
    graph.add_node("executor",     _wrap(run_executor,     "Executor"))
    graph.add_node("triage",       _wrap(run_triage,       "Triage"))
    graph.add_node("reporter",     _wrap(run_reporter,     "Reporter"))

    graph.add_edge(START, "code_analyst")
    graph.add_edge("code_analyst", "test_writer")
    graph.add_edge("test_writer", "executor")
    graph.add_edge("executor", "triage")
    graph.add_edge("triage", "reporter")
    graph.add_edge("reporter", END)

    return graph.compile()


_PIPELINE = None


def get_pipeline():
    """Returns cached singleton pipeline graph."""
    global _PIPELINE
    if _PIPELINE is None:
        _PIPELINE = build_graph()
    return _PIPELINE
