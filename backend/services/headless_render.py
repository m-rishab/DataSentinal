"""Headless-Chromium fallback for pages that block plain HTTP scrapers.

Kaggle serves a JS-challenge shell to non-browser clients, which is why
files / columns / license often come back empty. When the fast requests-based
scrape yields too little, we re-render the page through a locally installed
Chromium-family browser (Chrome / Brave / Edge / Chromium) in headless mode
and parse the fully-rendered DOM instead.

No third-party Python dependency: we shell out to the browser binary with
`--dump-dom`, exactly like a one-shot puppeteer render.
"""

from __future__ import annotations

import os
import shutil
import subprocess

BROWSER_CANDIDATES = [
    # Env override wins, then common macOS / Linux locations.
    os.environ.get("DATASENTINEL_BROWSER", ""),
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
]


class HeadlessRenderError(Exception):
    pass


def find_browser() -> str | None:
    """Return the first available Chromium-family browser binary."""
    override = os.environ.get("DATASENTINEL_BROWSER")
    if override:
        if os.path.isfile(override) and os.access(override, os.X_OK):
            return override
        found = shutil.which(override)
        if found:
            return found
    for candidate in BROWSER_CANDIDATES:
        if candidate and os.path.isfile(candidate) and os.access(candidate, os.X_OK):
            return candidate
    return shutil.which("chromium") or shutil.which("google-chrome")


def render_page(url: str, virtual_time_budget_ms: int = 12_000, timeout_s: int = 40) -> str:
    """Render `url` in headless Chromium and return the post-JS DOM as HTML.

    Raises HeadlessRenderError when no browser exists or rendering fails —
    callers are expected to degrade gracefully.
    """
    browser = find_browser()
    if not browser:
        raise HeadlessRenderError(
            "No headless-capable browser found (set DATASENTINEL_BROWSER to a "
            "Chrome/Brave/Edge binary to enable the rendered-page fallback)."
        )

    cmd = [
        browser,
        "--headless=new",
        "--disable-gpu",
        "--no-sandbox",
        "--disable-dev-shm-usage",
        "--hide-scrollbars",
        f"--virtual-time-budget={virtual_time_budget_ms}",
        f"--timeout={timeout_s * 1000}",
        "--dump-dom",
        url,
    ]
    try:
        proc = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout_s + 10,
        )
    except subprocess.TimeoutExpired as exc:
        raise HeadlessRenderError(f"Headless render timed out after {timeout_s}s") from exc
    except OSError as exc:
        raise HeadlessRenderError(f"Failed to launch {browser}: {exc}") from exc

    html = (proc.stdout or "").strip()
    if proc.returncode != 0 or len(html) < 5_000:
        raise HeadlessRenderError(
            f"Headless render produced no usable DOM (exit={proc.returncode}, "
            f"bytes={len(html)})."
        )
    return html
