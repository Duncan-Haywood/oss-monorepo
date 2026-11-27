#!/usr/bin/env python3
"""Rewrites made when PayApps moved from private-monorepo to this public repository.

    python3 ventures/payapps/rewrite_public.py ventures/payapps

Made-up addresses in UI placeholders and test fixtures used real, registrable
domains (builder.com, sierra.com ...). The pre-publication audit flags them
(platform/security/prepub_audit.py, "email address outside example domains");
this moves them to the reserved `.example` TLD (RFC 2606), keeping the local
part and the case. Idempotent; sync-from-private.sh runs it after each refresh.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

FIXTURE_DOMAINS = ("builder", "supplier", "harborbuilders", "peakgc", "sierra")
# The optional backslash catches the same address inside a test's regex literal (`@sierra\.com`).
EMAIL = re.compile(r"@(" + "|".join(FIXTURE_DOMAINS) + r")(\\?)\.com\b", re.I)
SUFFIXES = {".ts", ".tsx", ".mjs", ".js", ".json", ".md"}


def rewrite(text: str) -> str:
    return EMAIL.sub(lambda m: f"@{m.group(1)}{m.group(2)}.example", text)


def main(root: str) -> int:
    changed = 0
    for path in sorted(Path(root).rglob("*")):
        if {"node_modules", "dist", ".wrangler"} & set(path.parts) or path.suffix not in SUFFIXES or not path.is_file():
            continue
        text = path.read_text(encoding="utf-8")
        new = rewrite(text)
        if new != text:
            path.write_text(new, encoding="utf-8")
            changed += 1
            print(f"rewrote {path}")
    print(f"{changed} file(s) rewritten")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1] if len(sys.argv) > 1 else str(Path(__file__).parent)))
