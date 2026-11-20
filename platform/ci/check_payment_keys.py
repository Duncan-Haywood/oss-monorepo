#!/usr/bin/env python3
"""Fail if the tree hardcodes a real payment account (ventures/, platform/, docs/).

The rule (`prompts/goals.md`, "Payments: never the owner's", 2026-10-15):
payment code is allowed when it is off by default and runs on keys that
whoever deploys the product supplies through environment variables. What is
never allowed is wiring a specific account into the public tree, because
then every copy pays that account, and if it is the owner's the liability is
the owner's.

So this does not look for payment SDKs. It looks for the ways an account
gets hardcoded:

- a live Stripe secret, restricted or publishable key (`sk_live_`,
  `rk_live_`, `pk_live_`: client-only Checkout charges the account a
  publishable key names, so it wires an account as surely as a secret does);
- a Stripe Payment Link or donation link with a real link id
  (`buy.stripe.com/...`, `donate.stripe.com/...`);
- a PayPal Payment Link (`paypal.com/ncp/payment/...`);
- a PayPal hosted-button id (`hosted_button_id=...`, or the same in a form
  input, either attribute order, JSON or object literal).
- a merchant-of-record checkout link (Lemon Squeezy `/buy/`, Polar
  `buy.polar.sh/polar_cl_`, Paddle `pay.paddle.io/hsc_`, Gumroad `/l/`) or
  one of their live API keys (`polar_oat_`, `polar_pat_`, `pdl_live_`): the
  owner's checkout link is set from owner-only config, never committed.

A donate-to-the-creator profile link (`paypal.me/...`, a coffee link) is the
owner's stated choice (`goals.md`, the owner's priorities) and passes.

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
# Everything the site serves or a reader copies from, not just ventures/:
# platform/pages is the catalogue itself and docs/ holds the blog
# (red-team 2026-11-20: a link there was never scanned).
SCANNED = (VENTURES, REPO_ROOT / "platform", REPO_ROOT / "docs")
# This guard's own tests spell out the patterns they must reject.
SELF_TESTS = {Path(__file__).resolve().parent / "test_check_payment_keys.py"}

# Each pattern carries a literal every match must contain. A plain bytes
# `in` test on the raw file is far cheaper than decoding it and running the
# regex, and almost no file holds any of these literals, so the regex runs
# on a handful of files instead of all ~25,000 (docs/history/
# ci-perf-2026-11-04-payment-keys-literal-prefilter.md).
PATTERNS = (
    ("live Stripe key", b"k_live_", re.compile(r"(?<![A-Za-z0-9])[srp]k_live_[A-Za-z0-9]{16,}")),
    ("Stripe payment link", b"stripe.com/", re.compile(r"\b(?i:(?:buy|donate)\.stripe\.com)/(?:test_)?[A-Za-z0-9]{10,}")),
    ("PayPal payment link", b"paypal.com/ncp/payment/", re.compile(r"\b(?i:paypal\.com/ncp/payment)/[A-Za-z0-9]{8,}")),
    ("PayPal hosted button", b"hosted_button_id", re.compile(
        r"""(?i:hosted_button_id)(?:["']?\s*[:=]\s*["']?|["']\s+value=["'])[A-Z0-9]{8,}"""
        # The same hidden input with value= written before name=.
        r"""|(?i:value)=["'][A-Z0-9]{8,}["'][^<>]*?(?i:name)=["'](?i:hosted_button_id)["']""")),
    # Merchant-of-record hosted checkouts (goals.md, "Payments: the owner's
    # merchant of record, never a key": the link comes from owner-only config,
    # never the tree). A product checkout names the seller's account; the
    # providers' home pages and storefront roots do not, and pass.
    ("merchant-of-record checkout link", b"lemonsqueezy.com/", re.compile(
        r"(?i:\.lemonsqueezy\.com/(?:checkout/)?buy)/[A-Za-z0-9-]{8,}")),
    ("merchant-of-record checkout link", b"polar.sh/polar_cl_", re.compile(
        r"(?i:buy\.polar\.sh)/polar_cl_[A-Za-z0-9]{8,}")),
    ("merchant-of-record checkout link", b"paddle.io/hsc_", re.compile(
        r"(?i:pay\.paddle\.io)/hsc_[A-Za-z0-9]{8,}")),
    ("merchant-of-record checkout link", b"gumroad.com/l/", re.compile(
        r"(?i:gumroad\.com/l)/[A-Za-z0-9_-]{3,}")),
    # Their server-side keys: a Polar organization or personal access token,
    # a Paddle live API key (sandbox keys, pdl_sdbx_, pass like sk_test_).
    ("merchant-of-record API key", b"polar_", re.compile(r"(?<![A-Za-z0-9])polar_(?:oat|pat)_[A-Za-z0-9]{16,}")),
    ("merchant-of-record API key", b"pdl_live_", re.compile(r"(?<![A-Za-z0-9])pdl_live_[A-Za-z0-9_]{16,}")),
)

# Anything text is scanned (a key in a .sh, .vue or .txt file is as public as
# one in a .ts); only binary formats are skipped.
BINARY_SUFFIXES = {
    ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".pdf", ".zip", ".gz",
    ".tgz", ".woff", ".woff2", ".ttf", ".otf", ".mp3", ".mp4", ".wasm",
    ".sqlite", ".db",
}
SKIP_DIRS = {"node_modules", ".next", "dist", "build", "__pycache__", ".git"}
SKIP_NAMES = {"package-lock.json", "pnpm-lock.yaml", "yarn.lock"}


def findings_in(root: Path):
    """Yield (path, kind) for every hardcoded payment account under root."""
    for path in root.rglob("*"):
        if not path.is_file() or path.name in SKIP_NAMES or path.resolve() in SELF_TESTS:
            continue
        if any(part in SKIP_DIRS for part in path.relative_to(root).parts):
            continue
        if path.suffix.lower() in BINARY_SUFFIXES:
            continue
        try:
            data = path.read_bytes()
        except OSError:
            continue
        if b"\0" in data[:8192]:
            continue
        lowered = data.lower()  # hostnames are case-insensitive: BUY.Stripe.com is the same link
        candidates = [(kind, pattern) for kind, needle, pattern in PATTERNS if needle in lowered]
        if not candidates:
            continue
        text = data.decode("utf-8", errors="ignore")
        seen = set()
        for kind, pattern in candidates:
            if kind not in seen and pattern.search(text):
                seen.add(kind)
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


def check_all(roots=SCANNED) -> list[str]:
    return sorted(line for root in roots for line in check(root))


def main() -> int:
    violations = check_all()
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
