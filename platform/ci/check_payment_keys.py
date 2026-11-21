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

import os
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
SELF_NAMES = {p.name for p in SELF_TESTS}

# A bytes `in` test costs one pass over the file whatever the literal, and
# the scanned trees hold ~400 MB of text, so eleven literals cost eleven
# passes. Each gate below is contained in one or more literals, so a file
# without the gate cannot hold any of them: five passes decide almost every
# file, and the literals behind a gate are tried only where it appears
# (docs/history/ci-perf-2026-11-21-payment-keys-gates-and-walk.md).
GATES = (b"_live_", b"polar", b".com/", b"hosted_button_id", b"paddle.io/hsc_")


def _gated(patterns=PATTERNS, gates=GATES):
    """Group patterns under the first gate their literal contains."""
    groups: dict[bytes, list] = {}
    for kind, needle, pattern in patterns:
        gate = next((g for g in gates if g in needle), needle)
        groups.setdefault(gate, []).append((kind, needle, pattern))
    return tuple((gate, tuple(members)) for gate, members in groups.items())


GATED = _gated()


def _files(root: Path):
    """Yield (path, name, is_symlink) for every regular file under root.

    Same set as `root.rglob("*")` filtered by `is_file()` and SKIP_DIRS, but a
    skipped directory is never entered, the file type comes from the
    directory entry instead of a stat, and symlinked directories are not
    followed (neither are they by rglob). Paths stay strings: building a
    Path per file cost more than reading the file.
    """
    stack = [str(root)]
    while stack:
        top = stack.pop()
        try:
            it = os.scandir(top)
        except OSError:
            continue
        with it:
            for entry in it:
                if entry.name in SKIP_DIRS:
                    # rglob filtered on every part of the relative path,
                    # the file's own name included.
                    continue
                try:
                    if entry.is_dir(follow_symlinks=False):
                        stack.append(entry.path)
                        continue
                    if entry.is_file():
                        yield entry.path, entry.name, entry.is_symlink()
                except OSError:
                    continue


def findings_in(root: Path):
    """Yield (path, kind) for every hardcoded payment account under root."""
    for path, name, is_link in _files(root):
        if name in SKIP_NAMES:
            continue
        # Only a file with the test's name, or a symlink, can resolve to it.
        if (name in SELF_NAMES or is_link) and Path(path).resolve() in SELF_TESTS:
            continue
        dot = name.rfind(".")  # Path.suffix: a leading or trailing dot is no suffix
        if 0 < dot < len(name) - 1 and name[dot:].lower() in BINARY_SUFFIXES:
            continue
        try:
            with open(path, "rb") as fh:
                data = fh.read()
        except OSError:
            continue
        if b"\0" in data[:8192]:
            continue
        lowered = data.lower()  # hostnames are case-insensitive: BUY.Stripe.com is the same link
        candidates = [
            (kind, pattern)
            for gate, members in GATED if gate in lowered
            for kind, needle, pattern in members if needle in lowered
        ]
        if not candidates:
            continue
        text = data.decode("utf-8", errors="ignore")
        seen = set()
        for kind, pattern in candidates:
            if kind not in seen and pattern.search(text):
                seen.add(kind)
                yield Path(path), kind


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
