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
from html import unescape
from pathlib import Path
from urllib.parse import unquote, urlsplit

# href/src on any element, plus the ES module specifiers the calculators use to
# pull in `calc.mjs` and `usage.mjs`.
ATTR_RE = re.compile(r"""\b(?:href|src)\s*=\s*["']([^"']+)["']""", re.IGNORECASE)
IMPORT_RE = re.compile(r"""\bfrom\s+["'](\.{1,2}/[^"']+)["']""")

ID_RE = re.compile(r"""\b(?:id|name)\s*=\s*["']([^"']+)["']""", re.IGNORECASE)

SKIP_PREFIXES = ("http://", "https://", "//", "mailto:", "tel:", "data:", "javascript:")


def _targets(markup: str):
    for match in ATTR_RE.finditer(markup):
        yield match.group(1)
    for match in IMPORT_RE.finditer(markup):
        yield match.group(1)


def _anchor_ids(path: Path, cache: dict) -> set:
    if path not in cache:
        cache[path] = set(ID_RE.findall(path.read_text(encoding="utf-8", errors="replace")))
    return cache[path]


def _is_anchor(fragment: str) -> bool:
    """True for a plain `#section-id`, False for state a page decodes itself.

    Calculators hand a prefilled worked example over as `#price=200&...` or
    `#c=%7B...%7D`; those are read by the receiving page's script, not scrolled
    to, so no element needs to carry that id.
    """
    return bool(fragment) and fragment != "top" and not re.search(r"[=&%{]", fragment)


def check_site(site_dir: Path) -> list[str]:
    problems: list[str] = []
    ids_cache: dict = {}
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

            # `urlsplit`, not `urldefrag`: only `#fragment` is stripped by the
            # latter, so a link to a prefilled worked example -- `./?itemCost=
            # 200&amp;freightCost=20&amp;…`, which is how a guide page hands the
            # reader a filled-in calculator -- arrived here with its whole query
            # string still attached and was resolved as a literal filename. That
            # file cannot exist, so the link was reported broken while being
            # perfectly correct in a browser.
            #
            # `unescape` because an href is HTML-escaped: `&` is written `&amp;`
            # and a path containing one would otherwise be looked up by its
            # entity spelling.
            parts = urlsplit(unescape(target))
            path_part = unquote(parts.path)
            if not path_part:
                # `#section` on the same page: the id must exist here.
                if _is_anchor(parts.fragment) and parts.fragment not in _anchor_ids(page, ids_cache):
                    problems.append(f"{page.relative_to(site_dir)} -> {target} (no id=\"{parts.fragment}\" on this page)")
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
            elif resolved.suffix == ".html" and _is_anchor(parts.fragment):
                # The page exists but the section it points at does not: the
                # visitor lands at the top and never sees what the link promised.
                if parts.fragment not in _anchor_ids(resolved, ids_cache):
                    rel = page.relative_to(site_dir)
                    problems.append(f"{rel} -> {target} (no id=\"{parts.fragment}\" in {resolved.name})")

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
