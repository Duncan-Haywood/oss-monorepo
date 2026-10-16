#!/usr/bin/env python3
"""Fail if a venture hardcodes a real payment account.

The rule (`prompts/goals.md`, "Payments: never the owner's", 2026-10-15):
payment code is allowed when it is off by default and runs on keys that
whoever deploys the product supplies through environment variables. What is
never allowed is wiring a specific account into the public tree, because
then every copy pays that account, and if it is the owner's the liability is
the owner's.

So this does not look for payment SDKs. It looks for the three ways an
account gets hardcoded:

- a live Stripe secret or restricted key (`sk_live_`, `rk_live_`);
- a Stripe Payment Link or donation link with a real link id
  (`buy.stripe.com/...`, `donate.stripe.com/...`);
- a PayPal hosted-button id (`hosted_button_id=...`).

Test-mode placeholders (`sk_test_checkout`) and env lookups pass. Lockfiles
are skipped: they carry package authors' funding links, not ours.

    python3 platform/ci/check_payment_keys.py
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
VENTURES = REPO_ROOT / "ventures"

PATTERNS = (
    ("live Stripe key", re.compile(r"\b[sr]k_live_[A-Za-z0-9]{16,}")),
    ("Stripe payment link", re.compile(r"\b(?:buy|donate)\.stripe\.com/(?:test_)?[A-Za-z0-9]{10,}")),
    ("PayPal hosted button", re.compile(r"hosted_button_id=[A-Z0-9]{8,}")),
)

SUFFIXES = {
    ".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".py", ".html", ".md",
    ".json", ".yaml", ".yml", ".toml", ".env", ".tf", ".tfvars", ".example",
}
SKIP_DIRS = {"node_modules", ".next", "dist", "build", "__pycache__", ".git"}
SKIP_NAMES = {"package-lock.json", "pnpm-lock.yaml", "yarn.lock"}


def findings_in(root: Path):
    """Yield (path, kind) for every hardcoded payment account under root."""
    for path in root.rglob("*"):
        if not path.is_file() or path.name in SKIP_NAMES:
            continue
        if any(part in SKIP_DIRS for part in path.parts):
            continue
        if path.suffix not in SUFFIXES and not path.name.startswith(".env"):
            continue
        try:
            text = path.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            continue
        for kind, pattern in PATTERNS:
            if pattern.search(text):
                yield path, kind


def check(ventures_root: Path = VENTURES) -> list[str]:
    if not ventures_root.is_dir():
        return []
    out = []
    for path, kind in findings_in(ventures_root):
        try:
            shown = path.relative_to(REPO_ROOT)
        except ValueError:
            shown = path
        out.append(f"{shown}: {kind}")
    return sorted(out)


def main() -> int:
    violations = check()
    if not violations:
        print("check_payment_keys: no hardcoded payment account found")
        return 0
    print("check_payment_keys: hardcoded payment account(s):")
    for line in violations:
        print(f"  - {line}")
    print()
    print(
        "Read keys and links from environment variables the deployer sets, and "
        "leave payments off when they are unset (PRODUCT_PLAYBOOK.md §6). If a "
        "live key was committed, it is public now: it must be rotated, not "
        "just deleted."
    )
    return 1


if __name__ == "__main__":
    sys.exit(main())
