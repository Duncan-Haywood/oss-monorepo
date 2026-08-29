"""Fetch a vendor page and turn it into a heading-indexed snapshot.

Only public pages the customer explicitly configures are ever fetched. No
personal data, login-gated content, or third-party page other than the
configured URL is touched.
"""

from __future__ import annotations

import re
import urllib.error
import urllib.request
from dataclasses import dataclass
from html.parser import HTMLParser
from typing import Any

USER_AGENT = "vendor-change-watch/0.1 (+informational vendor-page monitor)"

HEADING_TAGS = {"h1", "h2", "h3", "h4", "h5", "h6"}
SKIP_TAGS = {"script", "style", "noscript"}
DEFAULT_HEADING = "(page)"


class _SectionExtractor(HTMLParser):
    """Splits page text into sections keyed by the nearest preceding heading."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self._current_heading = DEFAULT_HEADING
        self._skip_depth = 0
        self._heading_buffer: list[str] = []
        self._in_heading = False
        self.sections: dict[str, list[str]] = {DEFAULT_HEADING: []}

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag in SKIP_TAGS:
            self._skip_depth += 1
        elif tag in HEADING_TAGS:
            self._in_heading = True
            self._heading_buffer = []

    def handle_endtag(self, tag: str) -> None:
        if tag in SKIP_TAGS and self._skip_depth > 0:
            self._skip_depth -= 1
        elif tag in HEADING_TAGS and self._in_heading:
            heading = "".join(self._heading_buffer).strip()
            self._in_heading = False
            if heading:
                self._current_heading = heading
                self.sections.setdefault(heading, [])

    def handle_data(self, data: str) -> None:
        if self._skip_depth:
            return
        if self._in_heading:
            self._heading_buffer.append(data)
            return
        text = data.strip()
        if text:
            self.sections[self._current_heading].append(text)

    def as_sections(self) -> list[dict[str, str]]:
        result = []
        for heading, parts in self.sections.items():
            text = re.sub(r"\s+", " ", " ".join(parts)).strip()
            if text:
                result.append({"heading": heading, "text": text})
        return result


def extract_sections(html: str) -> list[dict[str, str]]:
    parser = _SectionExtractor()
    parser.feed(html)
    return parser.as_sections()


@dataclass
class FetchResult:
    fetch_status: str
    html: str = ""
    http_status: int | None = None


def fetch_page(url: str, timeout: float = 15.0) -> FetchResult:
    """Fetch a URL, classifying the outcome instead of raising on the common cases.

    A blocked or rate-limited response and a network failure are both
    first-class states — the caller must be able to tell "the page did not
    change" apart from "we could not confirm either way".
    """
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            status = response.status
            body = response.read().decode(response.headers.get_content_charset() or "utf-8", errors="replace")
    except urllib.error.HTTPError as exc:
        if exc.code in (403, 429):
            return FetchResult(fetch_status="blocked", http_status=exc.code)
        return FetchResult(fetch_status=f"http_error_{exc.code}", http_status=exc.code)
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        return FetchResult(fetch_status=f"error:{exc}")

    if status != 200:
        return FetchResult(fetch_status=f"http_status_{status}", http_status=status)
    return FetchResult(fetch_status="ok", html=body, http_status=status)


def build_snapshot(
    vendor: str,
    page_url: str,
    page_type: str,
    captured_at: str,
    fetch_result: FetchResult | None = None,
) -> dict[str, Any]:
    """Turn a fetch (or an already-fetched result) into the diff engine's snapshot schema."""
    result = fetch_result if fetch_result is not None else fetch_page(page_url)
    sections = extract_sections(result.html) if result.fetch_status == "ok" else []
    return {
        "vendor": vendor,
        "page_url": page_url,
        "page_type": page_type,
        "captured_at": captured_at,
        "fetch_status": result.fetch_status,
        "sections": sections,
    }
