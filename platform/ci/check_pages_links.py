#!/usr/bin/env python3
"""Fail the build if the Pages artifact contains a link that would 404.

A published site whose links are broken is worse than an unpublished one: the
first visitor bounces and the crawl budget is spent on dead ends. Every product
here was authored in its own directory and has never been served from a shared
site root, so a page referencing `/calc.mjs` instead of `./calc.mjs` would work
in the venture directory and break under `<base>/<slug>/` -- exactly the class
of error nobody could have caught before a build existed.

Checks local references only. External links are somebody else's uptime.

Usage:
    python3 platform/ci/check_pages_links.py _site
"""

from __future__ import annotations

import re
import sys
from pathlib import Path
from urllib.parse import unquote, urldefrag

# href/src on any element, plus the ES module specifiers the calculators use to
# pull in `calc.mjs` and `usage.mjs`.
ATTR_RE = re.compile(r"""\b(?:href|src)\s*=\s*["']([^"']+)["']""", re.IGNORECASE)
IMPORT_RE = re.compile(r"""\bfrom\s+["'](\.{1,2}/[^"']+)["']""")

SKIP_PREFIXES = ("http://", "https://", "//", "mailto:", "tel:", "data:", "javascript:", "#")


def _targets(markup: str):
    for match in ATTR_RE.finditer(markup):
        yield match.group(1)
    for match in IMPORT_RE.finditer(markup):
        yield match.group(1)


def check_site(site_dir: Path) -> list[str]:
    problems: list[str] = []
    pages = sorted(site_dir.rglob("*.html"))

    for page in pages:
        markup = page.read_text(encoding="utf-8", errors="replace")
        for raw in _targets(markup):
            target = raw.strip()
            if not target or target.startswith(SKIP_PREFIXES):
                continue
            # JS template literals in inline scripts (e.g. href="${escapeHtml(href)}")
            # are not URLs. Treating them as local paths 404s the Pages build.
            if "${" in target:
                continue

            path_part = unquote(urldefrag(target)[0])
            if not path_part:
                continue

            if path_part.startswith("/"):
                # Root-absolute inside a project site would resolve above the
                # repo path segment and 404 on the live host.
                resolved = site_dir / path_part.lstrip("/")
            else:
                resolved = (page.parent / path_part).resolve()

            # A directory reference is served by its index.html.
            if resolved.is_dir():
                resolved = resolved / "index.html"

            if not resolved.exists():
                rel = page.relative_to(site_dir)
                problems.append(f"{rel} -> {target}")

    return problems


def main(argv: list[str]) -> int:
    site_dir = Path(argv[1] if len(argv) > 1 else "_site").resolve()
    if not site_dir.is_dir():
        print(f"FAIL: no site directory at {site_dir}")
        return 1

    pages = sorted(site_dir.rglob("*.html"))
    problems = check_site(site_dir)

    print(f"checked {len(pages)} page(s) in {site_dir}")
    if problems:
        print(f"\n{len(problems)} broken local reference(s):")
        for problem in problems:
            print(f"  - {problem}")
        return 1

    print("OK: every local reference resolves")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
