import requests
from typing import Any
import sys

from .config import get_gemini_api_key

GEMINI_MODEL = "gemini-flash-latest"
GEMINI_ENDPOINT = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent"


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
        response.raise_for_status()
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
        print(f"[GEMINI] FAILED: {type(e).__name__}: {str(e)}", file=sys.stderr)
        raise
