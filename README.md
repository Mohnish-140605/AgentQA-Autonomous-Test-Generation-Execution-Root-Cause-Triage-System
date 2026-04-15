# AgentQA — Autonomous Multi-Agent QA System

> Automated test generation & root-cause triage for any public GitHub Python repository, powered by **Gemini 1.5 Flash** and **LangGraph**.

---

## Prerequisites

| Tool       | Version  |
|------------|----------|
| Python     | 3.11 +   |
| Node.js    | 18 +     |
| Git        | any      |

---

## Quick Start

### 1 — Clone & configure

```bash
# Clone the repository
git clone https://github.com/Mohnish-140605/AgentQA-Autonomous-Test-Generation-Execution-Root-Cause-Triage-System.git
cd AgentQA-Autonomous-Test-Generation-Execution-Root-Cause-Triage-System

# Copy and fill in API keys
cp .env.example backend/.env
```

Edit `backend/.env`:

```
GEMINI_API_KEY=your_google_gemini_api_key_here
GITHUB_TOKEN=your_github_pat_here              # optional — raises rate limit from 60 → 5,000 req/hr

# Optional runtime toggles
AGENTQA_ENABLE_MUTATION=1
AGENTQA_DOCKER_EXEC=1
```

### 2 — Backend

```bash
pip install -r requirements.txt

cd backend
uvicorn main:app --reload --port 8000
# → API docs at http://localhost:8000/docs
```

### 3 — Frontend (new terminal)

```bash
cd frontend
npm install
npm run dev
# → Open http://localhost:5173
```

---

## Run with Docker (recommended)

Requirements: Docker Desktop (Windows/macOS) or Docker Engine (Linux).

```bash
docker compose up --build
```

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:8000` (docs at `/docs`)

Notes:
- Reports are persisted to `backend/reports/` via a volume.
- **Do not commit** any `backend/.env` or `frontend/.env` files.

---

## API Keys

| Key | Where to get it | Free? |
|-----|-----------------|-------|
| `GEMINI_API_KEY` | https://aistudio.google.com/app/apikey | ✅ Yes |
| `GITHUB_TOKEN`   | https://github.com/settings/tokens — classic token, `public_repo` scope | ✅ Yes |

---

## Architecture

```
agentqa/
├── backend/
│   ├── main.py                     FastAPI app (CORS, SSE, static reports)
│   ├── agents/
│   │   ├── code_analyst.py         Parses GitHub files via AST
│   │   ├── test_writer.py          Generates & enhances pytest with Gemini
│   │   ├── executor.py             Runs tests (subprocess + coverage)
│   │   ├── triage.py               Root-cause triage (patterns + Gemini)
│   │   └── reporter.py             JSON + PDF reports (reportlab)
│   ├── graph/
│   │   └── pipeline.py             LangGraph StateGraph orchestration
│   ├── routes/
│   │   └── analyze.py              POST /analyze, GET /stream/:id, GET /reports
│   ├── services/
│   │   └── github_service.py       GitHub REST API fetcher (up to 30 files)
│   └── utils/
│       ├── helpers.py              AST helpers, emit_pipeline_log
│       ├── gemini_client.py        Gemini 1.5 Flash REST client
│       └── config.py               Env var getters
└── frontend/
    └── src/
        ├── pages/
        │   ├── AnalysisPage.jsx    Hero + pipeline + results
        │   ├── ReportsPage.jsx     Reports history table
        │   └── ReportDetail.jsx    Full report breakdown
        └── App.jsx                 Router (react-router-dom)
```

## Pipeline Flow

```
GitHub URL → GitHub Fetch → Code Analyst → Test Writer → Executor → Triage → Reporter
                                                  ↓
                                         Gemini 1.5 Flash
                                   (5-branch test generation)
                                   (root-cause explanation)
```

## Research Targets

| Metric | Target |
|--------|--------|
| Test coverage | > 65% |
| Mutation kill rate | > 55% |
| Root-cause localisation | > 80% |
| Pipeline runtime (≤30 files) | < 10 min |

---

## Troubleshooting

**Backend won't start:**  
→ Make sure `backend/.env` has your `GEMINI_API_KEY`.  
→ Run `pip install -r requirements.txt` from the `agentqa/` directory.

**Frontend can't reach backend:**  
→ Check `frontend/.env` has `VITE_API_BASE=http://localhost:8000`.  
→ Start the backend first (`uvicorn main:app --reload --port 8000` from `agentqa/backend/`).

**GitHub rate limit error:**  
→ Add a `GITHUB_TOKEN` to `backend/.env` — raises the limit to 5 000 req/hr.

**`ModuleNotFoundError: No module named 'langgraph'`:**  
→ Run `pip install -r requirements.txt` from `agentqa/` (not from inside `backend/`).

---

## Compare + Mutation + Docker Execution

- Use **Analyze & Compare** in the UI to run your repository against a second (buggy) repository.
- Executor now computes:
  - pass/fail + coverage
  - **mutation score** using `mutmut`
- Test execution prefers Docker isolation (falls back to local if Docker is unavailable).

Optional toggle:

```bash
AGENTQA_DOCKER_EXEC=1   # default; tries Docker runtime for test execution
AGENTQA_DOCKER_EXEC=0   # force local runtime
AGENTQA_ENABLE_MUTATION=1  # enable mutmut mutation testing
AGENTQA_ENABLE_MUTATION=0  # default; mutation testing disabled
```

--IMAGES OF THE OVERALL WEBSITE 
<img width="3839" height="1841" alt="Screenshot 2026-04-16 005146" src="https://github.com/user-attachments/assets/b1fa41cc-daa9-48bf-9f7b-9a74ba170916" />

<img width="3839" height="1824" alt="Screenshot 2026-04-16 005158" src="https://github.com/user-attachments/assets/deca5f0b-367e-4047-b4d1-a354cc92a4c7" />

<img width="3839" height="1825" alt="Screenshot 2026-04-16 005210" src="https://github.com/user-attachments/assets/57f70056-7798-4088-9c4b-84e8a92f264f" />

<img width="3142" height="1509" alt="Screenshot 2026-04-16 005223" src="https://github.com/user-attachments/assets/725895bc-e920-4b93-88a3-c7fd8880046e" />

<img width="3605" height="1397" alt="Screenshot 2026-04-15 232822" src="https://github.com/user-attachments/assets/7537a730-6960-4a1b-98bd-5d66acfb937c" />

<img width="1239" height="604" alt="Screenshot 2026-04-15 233755" src="https://github.com/user-attachments/assets/4b2ae478-0e60-42be-aecc-f5dd045ce1db" />

<img width="3102" height="1553" alt="Screenshot 2026-04-15 235512" src="https://github.com/user-attachments/assets/2d86b8a6-fd72-4756-8778-62553293ae87" />

<img width="3839" height="1612" alt="Screenshot 2026-04-16 004913" src="https://github.com/user-attachments/assets/75bb0b0d-45a7-40ff-9389-6c50cdaf6736" />

<img width="3839" height="1642" alt="Screenshot 2026-04-16 004924" src="https://github.com/user-attachments/assets/8ebb08ad-2b97-4ad9-9335-934fb9205a76" />

<img width="3815" height="1673" alt="Screenshot 2026-04-16 004934" src="https://github.com/user-attachments/assets/25f0346b-0a76-4117-a814-cddb3ea620a7" />

<img width="3839" height="1807" alt="Screenshot 2026-04-16 004949" src="https://github.com/user-attachments/assets/0b91f89e-91e9-4a6a-8699-98954f30f33a" />

<img width="3839" height="1815" alt="Screenshot 2026-04-16 004959" src="https://github.com/user-attachments/assets/40b73bda-5e01-4bab-b713-7e0924597f83" />

<img width="3839" height="1809" alt="Screenshot 2026-04-16 005012" src="https://github.com/user-attachments/assets/3ab73c47-303b-4b16-bae6-fe03965271c8" />

<img width="3839" height="1799" alt="Screenshot 2026-04-16 005023" src="https://github.com/user-attachments/assets/10d5fcbe-6203-4e69-b64b-9d49b4c40dd5" />

<img width="3839" height="1829" alt="Screenshot 2026-04-16 005041" src="https://github.com/user-attachments/assets/2294e1eb-e1d8-43ad-8c40-dee72e787842" />

<img width="3839" height="1746" alt="Screenshot 2026-04-16 005059" src="https://github.com/user-attachments/assets/5e0ccdf1-29a8-48f8-a7b5-61591093613f" />

<img width="3839" height="1846" alt="Screenshot 2026-04-16 005112" src="https://github.com/user-attachments/assets/a6ab9aed-6914-42c6-becd-0ac01e6908e6" />


<img width="3839" height="1814" alt="Screenshot 2026-04-16 005135" src="https://github.com/user-attachments/assets/bfab06c4-5dc3-414d-a2dd-dd8b83081b22" />


If Docker is not installed or not available in PATH, AgentQA automatically falls back to local execution and reports the exact reason in the UI (`Execution Environment Status`).

If mutation testing is enabled but `mutmut` is unavailable in the active runtime, mutation score is reported as unavailable.

### Security note (important)

- Never commit `backend/.env` or `frontend/.env`.
- Generated reports in `backend/reports/` may contain runtime logs/errors. They are **gitignored**.
