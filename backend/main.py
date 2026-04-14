# FastAPI application for AgentQA analysis pipeline

import sys
import os

sys.path.insert(0, os.path.dirname(__file__))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from dotenv import load_dotenv

load_dotenv()

from routes.analyze import router as analyze_router
from utils.config import get_groq_api_key, get_gemini_api_key, get_github_token

app = FastAPI(title="AgentQA", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:5174", "http://127.0.0.1:5173", "http://127.0.0.1:5174", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(analyze_router, tags=["analysis"])

reports_dir = os.path.join(os.path.dirname(__file__), "reports")
os.makedirs(reports_dir, exist_ok=True)
app.mount("/reports", StaticFiles(directory=reports_dir), name="reports")


@app.on_event("startup")
async def startup_event():
    groq_key = get_groq_api_key()
    gemini_key = get_gemini_api_key()
    github_token = get_github_token()
    print("\n" + "="*60, file=sys.stderr)
    print("[STARTUP] AgentQA Backend Configuration", file=sys.stderr)
    print(f"[STARTUP] GROQ_API_KEY configured: {bool(groq_key)}", file=sys.stderr)
    if groq_key:
        print(f"[STARTUP] GROQ_API_KEY (first 25 chars): {groq_key[:25]}...", file=sys.stderr)
    print(f"[STARTUP] GEMINI_API_KEY configured: {bool(gemini_key)}", file=sys.stderr)
    if gemini_key:
        print(f"[STARTUP] GEMINI_API_KEY (first 25 chars): {gemini_key[:25]}...", file=sys.stderr)
    print(f"[STARTUP] GITHUB_TOKEN configured: {bool(github_token)}", file=sys.stderr)
    print("="*60 + "\n", file=sys.stderr)


# Root endpoint - Returns welcome message and link to API documentation
@app.get("/")
def root():
    return {"message": "AgentQA backend running", "docs": "/docs"}


# Health check endpoint
@app.get("/health")
def health_check():
    return {"status": "ok"}