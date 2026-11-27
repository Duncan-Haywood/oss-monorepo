#!/usr/bin/env python3
"""Rewrites made when Job Shop Quote moved from private-monorepo to this public repository.

    python3 ventures/jobshop-quote/rewrite_public.py ventures/jobshop-quote

Made-up addresses and sender domains in UI placeholders and test fixtures used
real, registrable domains (acme.com, customer.com, yourshop.com ...). The
pre-publication audit flags them (platform/security/prepub_audit.py, "email
address outside example domains"); this moves each such domain to the reserved
`.example` TLD (RFC 2606), keeping subdomains, the local part and the case. The
bare domain is rewritten too, not only the address, because the sender
allowlist tests compare an address against a domain entry (a domain entry must
match every address at that domain). Idempotent; sync-from-private.sh runs it after each
refresh. Same approach as ventures/payapps/rewrite_public.py.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

FIXTURE_DOMAINS = ("acme", "notacme", "customer", "yourshop", "example-shop")
# The optional backslash catches the same domain inside a regex literal (`acme\.com`).
DOMAIN = re.compile(r"\b(" + "|".join(FIXTURE_DOMAINS) + r")(\\?)\.com\b", re.I)
SUFFIXES = {".ts", ".tsx", ".mjs", ".js", ".json", ".md", ".html"}
SKIP = {"node_modules", "dist", ".wrangler"}


def rewrite(text: str) -> str:
    return DOMAIN.sub(lambda m: f"{m.group(1)}{m.group(2)}.example", text)


def main(root: str) -> int:
    changed = 0
    for path in sorted(Path(root).rglob("*")):
        if SKIP & set(path.parts) or path.suffix not in SUFFIXES or not path.is_file():
            continue
        if path.name == "pnpm-lock.yaml":
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
