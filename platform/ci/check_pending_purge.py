#!/usr/bin/env python3
"""Fail when a double opt-in purge deletes pending sign-ups without checking the link expiry.

Several ventures copy the same early-access list: a confirmation email that says "the link works
for 7 days", re-sent on request, and a daily purge of sign-ups never confirmed within 30 days.
A purge that tests only `created_at` deletes a row whose link was re-sent on day 29 the next day,
so the email's promise is broken (cmmc-site, red-team run 2026-11-27; seller-books and payapps
already guarded it). This check finds every SQL `DELETE ... WHERE status = 'pending'` in venture
source (tests excluded) and requires the same statement to name a confirmation-expiry column
(any column whose name contains `expires`).

    python3 platform/ci/check_pending_purge.py           # exit 1 on a finding
    python3 platform/ci/check_pending_purge.py PATH...   # check only these files
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SUFFIXES = {".mjs", ".js", ".ts", ".cjs"}
SKIP_DIRS = {"node_modules", "dist", "build", ".wrangler", "test", "tests", "__tests__"}

# One SQL string literal (backtick, double or single quote) that deletes pending rows.
STATEMENT = re.compile(
    r"""(`[^`]*?DELETE\s+FROM[^`]*?status\s*=\s*'pending'[^`]*`"""
    r"""|"[^"\n]*?DELETE\s+FROM[^"\n]*?status\s*=\s*'pending'[^"\n]*")""",
    re.IGNORECASE | re.DOTALL,
)


def findings(path: Path) -> list[str]:
    try:
        text = path.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError):
        return []
    out = []
    for m in STATEMENT.finditer(text):
        sql = m.group(0)
        if "created_at" not in sql.lower() or "expires" in sql.lower():
            continue
        line = text.count("\n", 0, m.start()) + 1
        out.append(f"{path.relative_to(ROOT) if path.is_relative_to(ROOT) else path}:{line}: "
                   "pending purge ignores the confirmation link's expiry; add "
                   "`AND (confirm_token_expires_at IS NULL OR confirm_token_expires_at <= ?)`")
    return out


def candidates(paths: list[str]) -> list[Path]:
    if paths:
        return [Path(p).resolve() for p in paths]
    files = []
    for p in (ROOT / "ventures").rglob("*"):
        if p.suffix not in SUFFIXES or not p.is_file():
            continue
        rel = p.relative_to(ROOT).parts
        if SKIP_DIRS.intersection(rel) or ".test." in p.name:
            continue
        files.append(p)
    return files


def main(argv: list[str]) -> int:
    bad = [f for p in candidates(argv) for f in findings(p)]
    for f in bad:
        print(f)
    if bad:
        print(f"{len(bad)} pending purge(s) ignore the confirmation link expiry", file=sys.stderr)
        return 1
    print("pending purges: every one checks the confirmation link expiry")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
