#!/usr/bin/env python3
"""Fail if a venture ships payment-collection code with no matching decision row.

Why this exists
----------------
`PRODUCT_PLAYBOOK.md` §6 and `portfolio/DIRECTION.md` "Legal guardrails" have
said the same thing since 2026-08-24: "No checkout, no card fields, no billing
code, no merchant of record, not even disabled." It is the one hard stop in a
portfolio whose whole model is free-and-disclaimed -- payment collection is what
turns a bug report into a chargeback, a regulator letter, or a lawsuit the owner
has to answer personally, not an agent.

That sentence was never backed by a check. On 2026-09-06 a session looking for
what it actually covered found two ventures with real payment-SDK code on
`main`, gated only by an unset environment variable rather than by anything
that would stop a merge: `local-site-studio` (flagged the same day, decision
row `local-site-studio-subtree-gate-crossing`, PR #731) and, previously
undocumented anywhere, `print-atelier`'s `stripe.checkout.sessions.create` and
Stripe Connect payout code (decision row `print-atelier-stripe-checkout`,
`portfolio/ledger/asks.yaml`). Both are dormant -- no key is set, no page is
public -- but "unset env var" is exactly the shape `PRODUCT_PLAYBOOK.md` §3
already uses for the *allowed* AI-key upgrade path, so it reads as the safe
pattern rather than the risky one. Nothing distinguished the two before this
check existed.

What is checked
----------------
Every `ventures/*` source file (not `node_modules`, not build output, not this
check's own fixtures) for an import of a payment-processor SDK -- `stripe`,
`braintree`, `square` (the connect/payments SDKs, not the geometry word),
`@paypal/checkout-server-sdk`, `paypal-rest-sdk`, `adyen`, `checkout-sdk-node`,
`razorpay`, `klarna` -- or that SDK's package name in `package.json`
dependencies. A venture slug is only allowed to contain one when it is listed
in `ALLOWED_EXCEPTIONS` below, each entry pointing at the `portfolio/ledger/
asks.yaml` decision row the owner has not yet ruled on.

This is a detector for *presence*, not a judge of whether the integration is
safe -- the same division `check_money_sign.py` and `clauses.mjs` already
make. A clean run does not mean a venture is free of payment risk in some other
form (a bought lead list, a scraped API); it means this one specific, high-cost
pattern has an owner-visible row before it ships.

Run it locally the same way CI does:

    python3 platform/ci/check_no_payment_code.py
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
VENTURES = REPO_ROOT / "ventures"

# Each entry names the decision row in portfolio/ledger/asks.yaml that covers
# this venture's payment code, so a session can go read the actual owner
# decision rather than trusting this comment. Remove an entry only after that
# row is closed accept-or-revert -- on revert, the payment code itself should
# already be gone, which will make this check pass on its own.
ALLOWED_EXCEPTIONS = {
    "local-site-studio": "local-site-studio-subtree-gate-crossing",
    "print-atelier": "print-atelier-stripe-checkout",
}

SDK_NAMES = (
    "stripe",
    "braintree",
    "@paypal/checkout-server-sdk",
    "paypal-rest-sdk",
    "@adyen/api-library",
    "checkout-sdk-node",
    "razorpay",
    "klarna-checkout",
)

# Import/require forms across the JS/TS spellings the fleet actually uses, plus
# Python's `import stripe` / `from stripe import`. Square is excluded from this
# regex family and matched separately below -- "square" alone is also a
# geometry and layout word ("square footage", "square feet"), and a name-only
# match would flag calculators that have nothing to do with payments.
_SDK_ALTERNATION = "|".join(re.escape(n) for n in SDK_NAMES)

SDK_PATTERN = re.compile(
    r"""
    (?:from\s+["']|require\(["']|import\(["']|import\s+(?:type\s+)?\w+\s+from\s+["']|import\s+["'])
    (?P<name>""" + _SDK_ALTERNATION + r""")
    (?:/|["'])
    """,
    re.VERBOSE,
)

# Python's bare `import stripe`, `import stripe as s`, and `from stripe import x`
# carry no quotes at all, so they need their own pattern rather than reusing the
# quoted JS/TS forms above. Anchored to a name boundary so `import stripedown`
# (not a real package, but the principle matters) can't match.
PY_SDK_PATTERN = re.compile(
    r"""^\s*(?:import\s+(?P<name1>""" + _SDK_ALTERNATION + r""")\b|"""
    r"""from\s+(?P<name2>""" + _SDK_ALTERNATION + r""")\s+import\b)""",
    re.VERBOSE | re.MULTILINE,
)

# The payments SDK, not the geometry word: `square` the package always
# appears as a scoped Connect/Payments import in practice.
SQUARE_PATTERN = re.compile(
    r"""(?:from\s+["']|require\(["']|import\(["'])(?:square|squareup)(?:/|["'])"""
)

SOURCE_SUFFIXES = {".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".py"}

SKIP_DIR_NAMES = {"node_modules", ".next", "dist", "build", "__pycache__", ".git"}


def _iter_source_files(venture_dir: Path):
    for path in venture_dir.rglob("*"):
        if not path.is_file():
            continue
        if any(part in SKIP_DIR_NAMES for part in path.parts):
            continue
        if path.suffix in SOURCE_SUFFIXES:
            yield path


def _package_json_hits(venture_dir: Path):
    for pkg_path in venture_dir.rglob("package.json"):
        if any(part in SKIP_DIR_NAMES for part in pkg_path.parts):
            continue
        try:
            data = json.loads(pkg_path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            continue
        deps = {}
        for key in ("dependencies", "devDependencies", "peerDependencies"):
            deps.update(data.get(key) or {})
        for name in SDK_NAMES:
            if name in deps:
                yield pkg_path, name
        for name in ("square", "squareup"):
            if name in deps:
                yield pkg_path, name


def findings_in(venture_dir: Path):
    """Yield (path, sdk_name) for every payment-SDK reference found."""
    for path, name in _package_json_hits(venture_dir):
        yield path, name
    for path in _iter_source_files(venture_dir):
        try:
            text = path.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            continue
        match = SDK_PATTERN.search(text)
        if match:
            yield path, match.group("name")
            continue
        py_match = PY_SDK_PATTERN.search(text)
        if py_match:
            yield path, py_match.group("name1") or py_match.group("name2")
            continue
        if SQUARE_PATTERN.search(text):
            yield path, "square"


def check(ventures_root: Path = VENTURES) -> list[str]:
    violations = []
    if not ventures_root.is_dir():
        return violations
    for venture_dir in sorted(p for p in ventures_root.iterdir() if p.is_dir()):
        slug = venture_dir.name
        if slug in ALLOWED_EXCEPTIONS:
            continue
        hits = list(findings_in(venture_dir))
        if not hits:
            continue
        def _display(p: Path) -> str:
            try:
                return str(p.relative_to(REPO_ROOT))
            except ValueError:
                return str(p)

        rel_paths = sorted({_display(p) for p, _name in hits})
        sdk_names = sorted({name for _p, name in hits})
        violations.append(
            f"{slug}: payment SDK ({', '.join(sdk_names)}) with no "
            f"ALLOWED_EXCEPTIONS entry -- {', '.join(rel_paths[:5])}"
            + (f" (+{len(rel_paths) - 5} more)" if len(rel_paths) > 5 else "")
        )
    return violations


def main() -> int:
    violations = check()
    if not violations:
        print("check_no_payment_code: no undeclared payment-SDK usage found")
        return 0
    print("check_no_payment_code: payment-collection code with no decision-queue row:")
    for line in violations:
        print(f"  - {line}")
    print()
    print(
        "PRODUCT_PLAYBOOK.md §6 and portfolio/DIRECTION.md 'Legal guardrails' "
        "forbid payment/checkout code fleet-wide. If this is real, add a row to "
        "portfolio/ledger/asks.yaml (gates: revenue, exposure: legal-person) and "
        "list the venture slug in ALLOWED_EXCEPTIONS in this file, pointing at "
        "that row's id. Do not add an exception without a row -- the row is what "
        "makes this the owner's decision instead of the merging session's."
    )
    return 1


if __name__ == "__main__":
    sys.exit(main())
