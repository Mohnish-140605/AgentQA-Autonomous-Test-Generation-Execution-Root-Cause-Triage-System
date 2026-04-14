import requests
from typing import Any
import sys

from .config import get_groq_api_key

GROQ_MODEL = "groq-3.5-mini"
GROQ_ENDPOINTS = [
    f"https://api.groq.ai/v1/models/{GROQ_MODEL}/outputs",
    "https://api.groq.ai/v1/text/completions",
    "https://api.groq.ai/v1/completions",
]


def _build_message_payload(messages: list[dict]) -> dict:
    return {
        "input": messages,
        "temperature": 0.2,
        "max_output_tokens": 400,
    }


def _build_openai_style_payload(messages: list[dict]) -> dict:
    return {
        "model": GROQ_MODEL,
        "messages": messages,
        "temperature": 0.2,
        "max_tokens": 400,
    }


def _parse_response(data: Any) -> str | None:
    if not isinstance(data, dict):
        return None

    if data.get("error"):
        raise ValueError(str(data["error"]))

    if "output" in data and isinstance(data["output"], list) and data["output"]:
        first = data["output"][0]
        contents = first.get("content", []) if isinstance(first, dict) else []
        if isinstance(contents, list):
            text_parts = []
            for item in contents:
                if isinstance(item, dict):
                    if "text" in item:
                        text_parts.append(str(item["text"]))
                    elif "type" in item and item["type"] == "output_text" and "text" in item:
                        text_parts.append(str(item["text"]))
            if text_parts:
                return "".join(text_parts).strip()

    if "choices" in data and isinstance(data["choices"], list) and data["choices"]:
        choice = data["choices"][0]
        if isinstance(choice, dict):
            message = choice.get("message")
            if isinstance(message, dict) and message.get("content"):
                return str(message["content"]).strip()
            if choice.get("text"):
                return str(choice["text"]).strip()

    if isinstance(data.get("text"), str):
        return data["text"].strip()

    if isinstance(data.get("response"), str):
        return data["response"].strip()

    return None


def groq_chat(messages: list[dict], temperature: float = 0.2, max_tokens: int = 400) -> str:
    api_key = get_groq_api_key()
    if not api_key:
        print("[GROQ] ERROR: GROQ_API_KEY not configured", file=sys.stderr)
        raise ValueError("GROQ_API_KEY is not configured")

    print(f"[GROQ] Starting chat with {len(messages)} messages, model={GROQ_MODEL}", file=sys.stderr)

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    for idx, endpoint in enumerate(GROQ_ENDPOINTS):
        print(f"[GROQ] Attempt {idx+1}/{len(GROQ_ENDPOINTS)}: {endpoint}", file=sys.stderr)
        payload = _build_message_payload(messages) if endpoint.endswith("/outputs") else _build_openai_style_payload(messages)
        payload["temperature"] = temperature
        payload["max_output_tokens" if endpoint.endswith("/outputs") else "max_tokens"] = max_tokens

        try:
            print(f"[GROQ] Sending request to {endpoint}...", file=sys.stderr)
            response = requests.post(endpoint, headers=headers, json=payload, timeout=30)
            print(f"[GROQ] Response status: {response.status_code}", file=sys.stderr)
            response.raise_for_status()
            data = response.json()
            text = _parse_response(data)
            if text:
                print(f"[GROQ] Success! Received {len(text)} chars", file=sys.stderr)
                return text
            print(f"[GROQ] Response parsed but no text found", file=sys.stderr)
        except Exception as e:
            print(f"[GROQ] Endpoint failed: {type(e).__name__}: {str(e)}", file=sys.stderr)
            continue

    print("[GROQ] ERROR: All endpoints failed", file=sys.stderr)
    raise RuntimeError("Groq API request failed for all attempted endpoints")
