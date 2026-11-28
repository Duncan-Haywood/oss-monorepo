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

Product-specific files are named in ALLOWED_TO_DIFFER. Shared test files are
held identical too (since 2026-11-28, red team): until then they could differ
and the check only printed a note, and by that day 19 test cases (a forged
webhook MAC, Object.prototype plan keys, the watermark-instant event, the
anchor-instant quota period) guarded one or two copies and not the rest, so a
mutant in cmmc's subscription-events.ts escaped that payapps' copy catches.
Since the code under test is byte-identical, a case that passes in one copy
passes in all: add it to every copy. A test that must differ per product goes
in TESTS_ALLOWED_TO_DIFFER with its reason, and is then only noted.

    python3 platform/ci/check_billing_copies.py      # exit 1 on drift
"""
from __future__ import annotations

import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
# Files each product is expected to tailor (exports, re-exports).
ALLOWED_TO_DIFFER = {"index.ts"}
# Test files a product may tailor, with why (empty: every shared test is product-agnostic).
TESTS_ALLOWED_TO_DIFFER: dict[str, str] = {}


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
        if name.endswith(".test.ts") and name in TESTS_ALLOWED_TO_DIFFER:
            notes.append(f"note: {name} differs between copies ({groups})")
        elif name.endswith(".test.ts"):
            errors.append(
                f"{name}: billing test copies differ ({groups}); the code under test is shared, "
                "so give every copy the union of the cases")
        elif name not in ALLOWED_TO_DIFFER:
            errors.append(f"{name}: billing copies differ ({groups}); port the change to every copy")
    errors.extend(missing_tests(dirs))
    return errors, notes


def missing_tests(dirs: list[Path]) -> list[str]:
    """A copy that lacks a test file a sibling copy carries for code they share.

    Added 2026-11-28 (red team): payapps alone carried crypto.test.ts, so a mutant in the other
    four copies' crypto.ts met no test. A test file is owed by a copy when that copy has the
    source it is named after (`crypto.test.ts` -> `crypto.ts`), or, for a test not named after
    one source, when two or more copies already carry it.
    """
    errors: list[str] = []
    tests = sorted({f.name for d in dirs for f in d.glob("*.test.ts")})
    for name in tests:
        holders = [d for d in dirs if (d / name).is_file()]
        source = name[: -len(".test.ts")] + ".ts"
        named_after_source = any((d / source).is_file() for d in dirs)
        for d in dirs:
            if d in holders:
                continue
            owed = (d / source).is_file() if named_after_source else len(holders) >= 2
            if owed:
                venture = str(d.relative_to(REPO)).split("/")[1]
                have = ", ".join(str(h.relative_to(REPO)).split("/")[1] for h in holders)
                errors.append(f"{name}: missing from {venture} (carried by {have}); copy the test over")
    return errors


def main() -> int:
    dirs = copies()
    errors, notes = drift(dirs)
    for n in notes:
        print(n)
    for e in errors:
        print(f"error: {e}", file=sys.stderr)
    print(f"check_billing_copies: {len(dirs)} copies, {len(errors)} drifted source or missing test file(s)")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
