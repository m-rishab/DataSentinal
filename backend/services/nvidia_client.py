"""Shared NVIDIA LLM client using the OpenAI-compatible API.

Loads NVIDIA configuration from environment variables or a project .env file
and talks to NVIDIA's OpenAI-compatible endpoint.
"""

from __future__ import annotations

import json
import os
import re
from functools import lru_cache
from typing import Any, Optional

import openai


def _load_dotenv() -> None:
    """Load a simple project .env file without overriding real environment values."""
    candidates = (
        os.getcwd(),
        os.path.dirname(os.path.dirname(os.path.dirname(__file__))),
    )
    for candidate in candidates:
        path = os.path.join(candidate, ".env")
        if not os.path.isfile(path):
            continue
        try:
            with open(path, encoding="utf-8") as fh:
                for line in fh:
                    line = line.strip()
                    if not line or line.startswith("#") or "=" not in line:
                        continue
                    key, _, value = line.partition("=")
                    os.environ.setdefault(
                        key.strip(), value.strip().strip('"').strip("'"),
                    )
        except OSError:
            pass
        break


# Load .env BEFORE reading configuration constants.
_load_dotenv()

NVIDIA_BASE_URL = os.getenv(
    "NVIDIA_BASE_URL",
    "https://integrate.api.nvidia.com/v1",
)
NVIDIA_MODEL = os.getenv("NVIDIA_MODEL", "meta/llama-3.3-70b-instruct")
NVIDIA_TIMEOUT = float(os.getenv("NVIDIA_TIMEOUT", "60"))


def is_llm_configured() -> bool:
    """Return True when an NVIDIA API key is available."""
    return bool(os.getenv("NVIDIA_API_KEY"))


@lru_cache(maxsize=1)
def get_client() -> Optional[openai.AsyncOpenAI]:
    """Return one shared AsyncOpenAI client, or None when no key is configured."""
    api_key = os.getenv("NVIDIA_API_KEY")
    if not api_key:
        return None
    return openai.AsyncOpenAI(
        api_key=api_key,
        base_url=NVIDIA_BASE_URL,
        timeout=NVIDIA_TIMEOUT,
        max_retries=2,
    )


async def llm_json(system_prompt: str, user_prompt: str, fallback: Any) -> Any:
    """Call NVIDIA and parse a JSON response.

    Configuration/authentication errors are raised so the caller can record a
    meaningful degraded state. Unexpected inference/JSON failures return the
    supplied fallback so the graph can continue safely.
    """
    client = get_client()
    if client is None:
        raise RuntimeError("NVIDIA_API_KEY is not configured")

    try:
        response = await client.chat.completions.create(
            model=NVIDIA_MODEL,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.0,
            max_tokens=1500,
        )
        content = response.choices[0].message.content
        if not content:
            return fallback
        return parse_llm_json(content, fallback)
    except Exception as exc:  # noqa: BLE001
        text = str(exc)
        if "403" in text or "Authorization failed" in text:
            raise RuntimeError(
                "NVIDIA API rejected the key (403 Authorization failed). "
                "Verify NVIDIA_API_KEY in .env and generate a valid key at "
                "https://build.nvidia.com."
            ) from exc
        if "401" in text:
            raise RuntimeError(
                "NVIDIA API key is invalid or expired (401). "
                "Update NVIDIA_API_KEY in .env."
            ) from exc
        # Do not hide a server-side/API failure from the caller. The graph
        # nodes already catch this and use their deterministic fallbacks.
        raise RuntimeError(f"NVIDIA inference failed: {text[:500]}") from exc


def parse_llm_json(raw: str, fallback: Any) -> Any:
    """Extract the first valid JSON value from an LLM response."""
    if not isinstance(raw, str) or not raw.strip():
        return fallback

    text = raw.strip()
    fence = re.search(r"```(?:json)?\s*(.*?)```", text, re.DOTALL | re.IGNORECASE)
    if fence:
        text = fence.group(1).strip()

    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    # Fall back to the first balanced object/array in the response.
    for opener, closer in (("{", "}"), ("[", "]")):
        start = text.find(opener)
        if start == -1:
            continue

        depth = 0
        in_string = False
        escaped = False

        for idx in range(start, len(text)):
            char = text[idx]

            if in_string:
                if escaped:
                    escaped = False
                elif char == "\\":
                    escaped = True
                elif char == '"':
                    in_string = False
                continue

            if char == '"':
                in_string = True
            elif char == opener:
                depth += 1
            elif char == closer:
                depth -= 1
                if depth == 0:
                    candidate = text[start : idx + 1]
                    try:
                        return json.loads(candidate)
                    except json.JSONDecodeError:
                        break

    return fallback