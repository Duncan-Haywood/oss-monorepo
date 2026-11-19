#!/usr/bin/env python3
"""Every hand-written list of Stripe zero-decimal currencies must be complete.

Stripe sends amounts in the currency's smallest unit; for 16 currencies that
unit is the whole currency (5000 XPF is 5,000 francs, not 50.00). On
2026-11-16 three ventures carried a short list (dunning-engine 10 codes,
trial-converter 7, cancel-flow 4), so a 5,000 XPF invoice was emailed to the
customer as "CFPF 50", 100 times too small. This check finds every quoted list
or set under ventures/ and platform/ that names both jpy and krw (trial.mjs held
one without ever saying "stripe", so no file filter), and fails if it lacks any
code on Stripe's list
(https://docs.stripe.com/currencies#zero-decimal).

    python3 platform/ci/check_stripe_zero_decimal.py      # exit 1 on a short list
"""
import pathlib
import re
import sys
from repo_files import ls_files

ROOT = pathlib.Path(__file__).resolve().parents[2]
STRIPE_ZERO = {"bif", "clp", "djf", "gnf", "jpy", "kmf", "krw", "mga", "pyg", "rwf",
               "ugx", "vnd", "vuv", "xaf", "xof", "xpf"}
SUFFIXES = {".mjs", ".js", ".cjs", ".ts", ".py"}
# A bracketed literal: [ ... ] or { ... } or ( ... ) with no nested brackets.
LITERAL = re.compile(r"[\[{(]([^\[\]{}()]*)[\]})]")
QUOTED = re.compile(r"""["']([^"'\n]*)["']""")
# ISK is zero-decimal in Intl and was in dunning-engine's list; allowing it keeps
# a list that names it a zero-decimal list rather than some other set of codes.
EXTRA_OK = {"isk"}


def short_lists(text):
    """Yield (line, missing codes) for each zero-decimal list literal in text."""
    for m in LITERAL.finditer(text):
        tokens = [t.lower() for t in QUOTED.findall(m.group(1))]
        codes = set(tokens)
        # Only a literal made of nothing but zero-decimal codes is such a list: a
        # symbol map ("¥": "JPY") or a full ISO enumeration (with "usd") is not.
        if "jpy" in codes and "krw" in codes and codes <= STRIPE_ZERO | EXTRA_OK:
            missing = STRIPE_ZERO - codes
            if missing:
                yield text.count("\n", 0, m.start()) + 1, sorted(missing)


def tracked(root=ROOT):
    for rel in ls_files(root, "ventures", "platform"):
        p = root / rel
        if p.suffix in SUFFIXES and "node_modules" not in p.parts and not re.search(r"(\.test\.|/test_)", rel):
            yield rel, p


def findings(root=ROOT):
    hits = []
    for rel, p in tracked(root):
        try:
            text = p.read_text(encoding="utf-8")
        except (UnicodeDecodeError, OSError):
            continue
        for line, missing in short_lists(text):
            hits.append(f"{rel}:{line}: zero-decimal list lacks {', '.join(missing)}")
    return hits


def main():
    hits = findings()
    for h in hits:
        print(h)
    if hits:
        print(f"{len(hits)} short Stripe zero-decimal list(s): amounts in those currencies show 100x too small.")
        return 1
    print("Stripe zero-decimal lists: all complete.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
