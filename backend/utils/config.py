import os


def get_openai_api_key() -> str:
    return os.getenv("OPENAI_API_KEY", "").strip()


def get_groq_api_key() -> str:
    return os.getenv("GROQ_API_KEY", "").strip()


def get_gemini_api_key() -> str:
    return os.getenv("GEMINI_API_KEY", "").strip()


def get_github_token() -> str:
    return os.getenv("GITHUB_TOKEN", "").strip()


def is_debug_mode() -> bool:
    return os.getenv("DEBUG", "").strip().lower() in {"1", "true", "yes", "on"}
