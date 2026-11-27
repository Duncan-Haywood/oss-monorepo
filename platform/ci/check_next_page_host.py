#!/usr/bin/env python3
"""Fail when code strips an API base off a URL with `.replace(base, "")`.

Red team, 2026-11-27: the Paddle clients in five billing copies followed a
list response's `meta.pagination.next` with `url.replace(this.base, "")` and
then fetched `${this.base}${path}` with the bearer key. `replace` leaves a URL
on any other host whole, so the key went to `https://api.paddle.comhttps://...`.
The fix is a prefix check that refuses a URL outside the base
(`nextPagePath()` in `packages/billing/src/paddle.ts`); this check stops the
`replace` idiom from coming back in any TypeScript or JavaScript source
(tests excluded: they build their fake URLs themselves).

    python3 platform/ci/check_next_page_host.py      # exit 1 on a finding
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from repo_files import ls_files  # noqa: E402

REPO = Path(__file__).resolve().parents[2]
# `.replace(this.base, "")`, `.replace(baseUrl, '')`, `.replace(API_BASE, "")` ...
PATTERN = re.compile(r"""\.replace\(\s*(?:this\.)?\w*base\w*\s*,\s*(?:""|''|``)\s*\)""", re.I)
COMMENT = re.compile(r"^\s*(?://|\*|/\*)")


def scan_text(text: str) -> list[int]:
    """1-based line numbers with the idiom, outside comment lines."""
    return [i for i, line in enumerate(text.splitlines(), 1)
            if not COMMENT.match(line) and PATTERN.search(line)]


def files(repo: Path = REPO) -> list[Path]:
    out = ls_files(repo, "*.ts", "*.mjs", "*.js", "*.tsx")
    # Tests drive a local fake whose URLs they build themselves.
    return [repo / f for f in out if "node_modules/" not in f and ".test." not in f
            and "/test/" not in f"/{f}" and "/tests/" not in f"/{f}"]


def main() -> int:
    findings = []
    for path in files():
        try:
            text = path.read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue
        for n in scan_text(text):
            findings.append(f"{path.relative_to(REPO)}:{n}")
    for f in findings:
        print(f"error: {f}: strips an API base with .replace(); a URL on another host stays whole "
              "and is fetched with the key. Check startsWith(`${base}/`) and slice instead "
              "(see nextPagePath in ventures/payapps/packages/billing/src/paddle.ts).",
              file=sys.stderr)
    print(f"check_next_page_host: {len(findings)} finding(s)")
    return 1 if findings else 0


if __name__ == "__main__":
    sys.exit(main())
