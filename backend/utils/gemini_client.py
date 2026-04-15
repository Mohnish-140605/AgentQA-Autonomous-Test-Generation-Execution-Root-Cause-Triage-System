import requests
from typing import Any
import sys
import re

from .config import get_gemini_api_key

GEMINI_MODEL = "gemini-flash-latest"
GEMINI_ENDPOINT = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent"

def _sanitize_error_text(text: str) -> str:
    if not text:
        return text
    # Never leak API keys in logs/reports (key=... query param).
    return re.sub(r"key=[^&\\s]+", "key=[REDACTED]", str(text))


def gemini_chat(messages: list[dict], temperature: float = 0.2, max_tokens: int = 400) -> str:
    """Call Google Gemini 1.5 Flash API via REST."""
    api_key = get_gemini_api_key()
    if not api_key:
        print("[GEMINI] ERROR: GEMINI_API_KEY not configured", file=sys.stderr)
        raise ValueError("GEMINI_API_KEY is not configured")

    print(f"[GEMINI] Starting chat with {len(messages)} messages, model={GEMINI_MODEL}", file=sys.stderr)

    # Build system instruction from system-role messages, content parts for user/model turns
    system_instruction = None
    contents = []

    for msg in messages:
        role = msg.get("role", "user")
        content = msg.get("content", "")

        if role == "system":
            # Gemini 1.5 supports a top-level systemInstruction field
            system_instruction = content
        else:
            gemini_role = "model" if role == "assistant" else "user"
            contents.append({
                "role": gemini_role,
                "parts": [{"text": content}]
            })

    # If no user turns were found at all, add a placeholder
    if not contents:
        contents.append({"role": "user", "parts": [{"text": "Proceed."}]})

    payload = {
        "contents": contents,
        "generationConfig": {
            "temperature": temperature,
            "maxOutputTokens": max_tokens,
        }
    }

    if system_instruction:
        payload["systemInstruction"] = {
            "parts": [{"text": system_instruction}]
        }

    url = f"{GEMINI_ENDPOINT}?key={api_key}"

    try:
        print(f"[GEMINI] Sending request to Gemini 1.5 Flash API...", file=sys.stderr)
        response = requests.post(url, json=payload, timeout=60)
        print(f"[GEMINI] Response status: {response.status_code}", file=sys.stderr)
        try:
            response.raise_for_status()
        except requests.HTTPError:
            # Use response body message, not full request URL (contains key).
            reason = ""
            try:
                err_json = response.json()
                reason = err_json.get("error", {}).get("message", "")
            except Exception:
                reason = response.text[:200]
            safe_reason = _sanitize_error_text(reason) if reason else "Gemini API request failed"
            raise RuntimeError(f"Gemini API HTTP {response.status_code}: {safe_reason}") from None
        data = response.json()

        if "candidates" in data and len(data["candidates"]) > 0:
            candidate = data["candidates"][0]
            if "content" in candidate and "parts" in candidate["content"]:
                parts = candidate["content"]["parts"]
                if len(parts) > 0 and "text" in parts[0]:
                    text = parts[0]["text"].strip()
                    print(f"[GEMINI] Success! Received {len(text)} chars", file=sys.stderr)
                    return text

        if "error" in data:
            error_msg = data["error"].get("message", "Unknown error")
            print(f"[GEMINI] API error: {error_msg}", file=sys.stderr)
            raise ValueError(error_msg)

        print(f"[GEMINI] Unexpected response format: {data}", file=sys.stderr)
        raise RuntimeError("Unexpected Gemini API response format")

    except Exception as e:
        safe_error = _sanitize_error_text(str(e))
        print(f"[GEMINI] FAILED: {type(e).__name__}: {safe_error}", file=sys.stderr)
        raise type(e)(safe_error)
