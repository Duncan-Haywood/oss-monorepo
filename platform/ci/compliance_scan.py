#!/usr/bin/env python3
"""Mechanical half of the recurring compliance review.

The review itself (`.github/prompts/compliance-review.md`) is a reading job:
licences, research data, consumer-protection claims, platform terms. Some of
what it found on 2026-10-20 (`docs/reports/2026-10-20-compliance-review.md`)
is regular enough to count, and counting it lets each review say whether
the number went down instead of re-sampling from scratch:

- brand-disclaimer: a page in a venture whose slug names a third-party brand
  (amazon-fba-calculator, shopify-fee-calculator) with no "not affiliated
  with" line. Naming a trademark to say what a tool works with is nominative
  fair use; leaving out the disclaimer is what invites the endorsement claim.
- third-party-request: a served venture page that loads a script, stylesheet
  or font from another host. That host sees the visitor's IP address, which
  EU courts have held needs consent (Google Fonts, LG Muenchen 2022), and it
  breaks the "nothing leaves your browser" promise.
- tracking-cookie: venture source that sets a persistent cookie. EU/UK
  ePrivacy rules need consent first for anything not strictly necessary.
- unsourced-competitor-figure: a `vs-*.html` page quoting a competitor's
  user or customer count with no "as of" date beside it.
- secret: a high-confidence credential pattern anywhere in the tree, with
  documented placeholders (AKIAIOSFODNN7EXAMPLE, sk-ant-...xxxx) left out.

It reports; it does not gate. Exit 0 unless --strict and something was found.

    python3 platform/ci/compliance_scan.py            # counts + examples
    python3 platform/ci/compliance_scan.py --json     # for the run record
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]

# Slug tokens that name someone else's product or company. Government
# programmes (irs, medicare) are not trademarks and are left out.
BRANDS = (
    "activecampaign", "airbnb", "amazon", "android", "aws", "depop", "ebay",
    "etsy", "fba", "fiverr", "github", "google", "gumroad", "hubspot",
    "kickstarter", "klaviyo", "mailchimp", "mercari", "patreon", "paypal",
    "poshmark", "quickbooks", "reverb", "salesforce", "shopify", "square",
    "stripe", "substack", "tiktok", "twitch", "upwork", "walmart", "whatnot",
    "xero", "youtube",
)
NOT_AFFILIATED = re.compile(r"not\s+affiliated\s+with", re.I)

EXTERNAL_ASSET = re.compile(
    r"<(?:script|link)\b[^>]*\b(?:src|href)\s*=\s*[\"'](https?:)?//([^/\"']+)", re.I
)
# <link rel="canonical|alternate"> and plain anchors point elsewhere without
# fetching anything; only fetching tags count.
NON_FETCHING_LINK = re.compile(r"rel\s*=\s*[\"'](?:canonical|alternate|me|author|license)", re.I)
OWN_HOSTS = ("duncan-haywood.github.io", "marisstella.dev")

# Writes only: a probe that reads a response's set-cookie header is not one.
COOKIE_WRITE = re.compile(
    r"document\.cookie\s*=(?!=)|[\"']set-cookie[\"']\s*(?:\]\s*=(?!=)|:)", re.I
)
COOKIE_PERSISTENT = re.compile(r"max-age|expires", re.I)

COMPETITOR_FIGURE = re.compile(
    r"(?:over|more than)\s+[\d,.]+\s*(?:k|m|million|thousand)?\+?\s+"
    r"(?:users|customers|businesses|companies|pros|teams|sellers|members)",
    re.I,
)
AS_OF = re.compile(r"\bas of\b", re.I)

SECRET_PATTERNS = (
    ("AWS access key", re.compile(r"\bAKIA[0-9A-Z]{16}\b")),
    ("GitHub token", re.compile(r"\bgh[pousr]_[A-Za-z0-9]{36}\b|\bgithub_pat_[A-Za-z0-9_]{50,}")),
    ("Anthropic key", re.compile(r"\bsk-ant-[A-Za-z0-9_-]{20,}")),
    ("OpenAI key", re.compile(r"\bsk-(?:proj-)?[A-Za-z0-9]{32,}")),
    ("Slack token", re.compile(r"\bxox[baprs]-[A-Za-z0-9-]{10,}")),
    ("Google API key", re.compile(r"\bAIza[0-9A-Za-z_-]{35}\b")),
    ("private key", re.compile(
        r"-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----\s*[A-Za-z0-9+/=\s]{200,}")),
)
# Documented examples and filler: AWS's own sample key, runs of x or 0,
# alphabet sequences.
PLACEHOLDER = re.compile(r"EXAMPLE|x{8}|X{8}|0{8}|ABCDEFGHIJ|abcdefghij", re.A)

BINARY_SUFFIXES = {
    ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".pdf", ".zip", ".gz",
    ".tgz", ".woff", ".woff2", ".ttf", ".otf", ".mp3", ".mp4", ".wasm",
    ".sqlite", ".db", ".stl", ".step", ".glb", ".parquet", ".npz", ".pt",
}
SKIP_DIRS = {"node_modules", ".next", "dist", "build", "__pycache__", ".git", ".venv"}
SKIP_NAMES = {"package-lock.json", "pnpm-lock.yaml", "yarn.lock", "uv.lock"}


def is_test(path: Path) -> bool:
    name = path.name
    return ".test." in name or name.startswith("test_") or "tests" in path.parts


def text_of(path: Path) -> str | None:
    if path.suffix.lower() in BINARY_SUFFIXES or path.name in SKIP_NAMES:
        return None
    try:
        data = path.read_bytes()
    except OSError:
        return None
    if b"\0" in data[:8192]:
        return None
    return data.decode("utf-8", errors="ignore")


def files_under(root: Path):
    for path in root.rglob("*"):
        if path.is_file() and not any(part in SKIP_DIRS for part in path.parts):
            yield path


def served_pages(venture: Path):
    """HTML a visitor can load: everything but tests and build output."""
    for path in files_under(venture):
        if path.suffix == ".html" and not is_test(path):
            yield path


def brand_of(slug: str) -> str | None:
    tokens = slug.split("-")
    return next((b for b in BRANDS if b in tokens), None)


def scan_ventures(ventures: Path):
    """Yield (check, path, detail) for the venture-level checks."""
    if not ventures.is_dir():
        return
    for venture in sorted(p for p in ventures.iterdir() if p.is_dir()):
        brand = brand_of(venture.name)
        for page in served_pages(venture):
            html = text_of(page) or ""
            if brand and not NOT_AFFILIATED.search(html):
                yield "brand-disclaimer", page, brand
            for match in EXTERNAL_ASSET.finditer(html):
                tag_start = html.rfind("<", 0, match.end())
                tag = html[tag_start:html.find(">", match.end()) + 1]
                host = match.group(2).lower()
                if NON_FETCHING_LINK.search(tag) or host.endswith(OWN_HOSTS):
                    continue
                yield "third-party-request", page, host
            if page.name.startswith("vs-") and COMPETITOR_FIGURE.search(html) and not AS_OF.search(html):
                yield "unsourced-competitor-figure", page, COMPETITOR_FIGURE.search(html).group(0)
        for path in files_under(venture):
            if is_test(path) or path.suffix not in {".js", ".mjs", ".ts", ".html", ".py"}:
                continue
            src = text_of(path) or ""
            for line in src.splitlines():
                if COOKIE_WRITE.search(line) and COOKIE_PERSISTENT.search(line):
                    yield "tracking-cookie", path, line.strip()[:80]
                    break


def scan_secrets(root: Path):
    for path in files_under(root):
        if is_test(path):
            continue
        text = text_of(path)
        if not text:
            continue
        for kind, pattern in SECRET_PATTERNS:
            for match in pattern.finditer(text):
                if not PLACEHOLDER.search(match.group(0)):
                    yield "secret", path, kind
                    break


def scan(root: Path = REPO_ROOT) -> dict[str, list[dict]]:
    found: dict[str, list[dict]] = {}
    for check, path, detail in [*scan_ventures(root / "ventures"), *scan_secrets(root)]:
        try:
            shown = str(path.relative_to(root))
        except ValueError:
            shown = str(path)
        found.setdefault(check, []).append({"path": shown, "detail": detail})
    return found


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--json", action="store_true", help="print findings as JSON")
    parser.add_argument("--strict", action="store_true", help="exit 1 when anything is found")
    parser.add_argument("--examples", type=int, default=5, help="examples shown per check")
    parser.add_argument("--root", type=Path, default=REPO_ROOT, help=argparse.SUPPRESS)
    args = parser.parse_args(argv)

    found = scan(args.root)
    if args.json:
        print(json.dumps({k: {"count": len(v), "findings": v} for k, v in found.items()}, indent=2))
    else:
        checks = ("secret", "brand-disclaimer", "third-party-request",
                  "tracking-cookie", "unsourced-competitor-figure")
        for check in checks:
            rows = found.get(check, [])
            print(f"{check}: {len(rows)}")
            for row in rows[: args.examples]:
                print(f"  {row['path']}  ({row['detail']})")
    return 1 if args.strict and found else 0


if __name__ == "__main__":
    sys.exit(main())
