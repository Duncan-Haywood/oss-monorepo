#!/usr/bin/env python3
"""Fail when the copies of the shared billing package drift apart.

Four paid products (payapps, jobshop-quote, cmmc, seller-books) each carry a
copy of `packages/billing/` (Paddle port, checkout tokens, grace, quota
periods). On 2026-11-27 the red team found the same test gap in all four
copies' checkout-token and period tests, and the copies' paddle tests had
already drifted (a fix landed in one copy, not the others). A security fix to
checkout-token.ts or crypto.ts that reaches one product and not its siblings
would leave three products open with no signal, so this check holds every
non-test source file that two or more copies share to be byte-identical.

Product-specific files are named in ALLOWED_TO_DIFFER. Test files may differ
(each product can add its own cases), but the check prints a note for a test
file a copy lacks or that differs, so a stronger guard can be ported.

    python3 platform/ci/check_billing_copies.py      # exit 1 on drift
"""
from __future__ import annotations

import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
# Files each product is expected to tailor (exports, re-exports).
ALLOWED_TO_DIFFER = {"index.ts"}


def copies(repo: Path = REPO) -> list[Path]:
    return sorted(p for p in (repo / "ventures").glob("*/packages/billing/src") if p.is_dir())


def drift(dirs: list[Path]) -> tuple[list[str], list[str]]:
    """(errors, notes) for source files shared by two or more copies."""
    errors: list[str] = []
    notes: list[str] = []
    names = sorted({f.name for d in dirs for f in d.glob("*.ts")})
    for name in names:
        present = [d / name for d in dirs if (d / name).is_file()]
        if len(present) < 2:
            continue
        variants: dict[bytes, list[Path]] = {}
        for p in present:
            variants.setdefault(p.read_bytes(), []).append(p)
        if len(variants) == 1:
            continue
        groups = "; ".join(
            ", ".join(str(p.relative_to(REPO)).split("/")[1] for p in ps) for ps in variants.values())
        if name.endswith(".test.ts"):
            notes.append(f"note: {name} differs between copies ({groups})")
        elif name not in ALLOWED_TO_DIFFER:
            errors.append(f"{name}: billing copies differ ({groups}); port the change to every copy")
    return errors, notes


def main() -> int:
    dirs = copies()
    errors, notes = drift(dirs)
    for n in notes:
        print(n)
    for e in errors:
        print(f"error: {e}", file=sys.stderr)
    print(f"check_billing_copies: {len(dirs)} copies, {len(errors)} drifted source file(s)")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
