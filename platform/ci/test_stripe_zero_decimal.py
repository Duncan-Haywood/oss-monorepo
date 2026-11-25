"""Stripe sends zero-decimal currencies (JPY, KRW, VND...) in whole units, not cents.

A venture that reads amounts from api.stripe.com and formats them with
`Intl.NumberFormat(..., {style: "currency"}).format(x / 100)` shows 12,000 yen as
120 unless the same file knows the zero-decimal list. Red team 2026-11-17 found
it in rev-rec (dashboard and journal CSV), mrr-pulse and cancel-flow's /admin
page; cancel-flow's flow.mjs already had the list, so it was a copy that
drifted. This lint fails the next copy.

The heuristic: in a venture whose code names api.stripe.com, every non-test
.mjs or .html file with a currency-style Intl.NumberFormat on a line that also
divides by 100 must mention "jpy" (the zero-decimal list) somewhere in the file.
A venture that only ever formats its own cents (user-typed amounts scaled by 100
and back) does not talk to Stripe and is not checked.
"""
import pathlib
import re
import subprocess
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[2]
# Source text that calls Stripe's API (a code search, not a URL check).
STRIPE_API = re.compile(r"api\.stripe\.com")
FORMAT_BY_100 = re.compile(r"""style:\s*["']currency["'].*/\s*100\b""")


def stripe_ventures(files):
    dirs = set()
    for rel in files:
        parts = rel.split("/")
        if len(parts) >= 3 and parts[0] == "ventures" and rel.endswith(".mjs") and ".test." not in rel:
            try:
                if STRIPE_API.search((ROOT / rel).read_text(encoding="utf-8")):
                    dirs.add(parts[1])
            except (OSError, UnicodeDecodeError):
                pass
    return dirs


def offenders(text_by_file):
    """Files (from {rel: text}) that format money by /100 with no zero-decimal list."""
    out = []
    for rel, text in sorted(text_by_file.items()):
        lines = [i + 1 for i, line in enumerate(text.splitlines()) if FORMAT_BY_100.search(line)]
        if lines and "jpy" not in text.lower():
            out.append(f"{rel}:{lines[0]}")
    return out


class StripeZeroDecimal(unittest.TestCase):
    def test_the_lint_flags_a_bare_divide_and_passes_a_list(self):
        bad = 'const f = (m, c) => new Intl.NumberFormat("en-US", { style: "currency", currency: c }).format(m / 100);'
        good = 'const Z = ["jpy", "krw"];\n' + bad
        self.assertEqual(offenders({"ventures/x/a.mjs": bad, "ventures/x/b.mjs": good}), ["ventures/x/a.mjs:1"])

    def test_stripe_ventures_handle_zero_decimal_currencies(self):
        files = subprocess.run(["git", "ls-files", "ventures"], cwd=ROOT, capture_output=True, text=True,
                               check=True).stdout.splitlines()
        stripe = stripe_ventures(files)
        self.assertIn("rev-rec", stripe)
        texts = {}
        for rel in files:
            parts = rel.split("/")
            if len(parts) < 3 or parts[1] not in stripe or ".test." in rel or "node_modules" in parts:
                continue
            if not (rel.endswith(".mjs") or rel.endswith(".html")):
                continue
            try:
                texts[rel] = (ROOT / rel).read_text(encoding="utf-8")
            except (OSError, UnicodeDecodeError):
                continue
        bad = offenders(texts)
        self.assertEqual(bad, [], "Stripe amounts in JPY/KRW/... are whole units: divide by 10 ** exponent, not 100 "
                                  "(see minorExponent in ventures/rev-rec/revrec.mjs)")


if __name__ == "__main__":
    unittest.main()
