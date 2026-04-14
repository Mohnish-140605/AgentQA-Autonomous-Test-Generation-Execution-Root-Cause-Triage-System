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
git clone https://github.com/your-org/agentqa.git
cd agentqa

# Copy and fill in API keys
cp .env.example backend/.env
```

Edit `backend/.env`:

```
GEMINI_API_KEY=your_google_gemini_api_key_here
GITHUB_TOKEN=ghp_your_github_pat_here          # optional — raises rate limit from 60 → 5,000 req/hr
```

### 2 — Backend

```bash
cd agentqa
pip install -r requirements.txt

cd backend
uvicorn main:app --reload --port 8000
# → API docs at http://localhost:8000/docs
```

### 3 — Frontend (new terminal)

```bash
cd agentqa/frontend
npm install
npm run dev
# → Open http://localhost:5173
```

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
