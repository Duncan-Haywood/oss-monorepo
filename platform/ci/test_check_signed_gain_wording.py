import tempfile
import unittest
from pathlib import Path

import check_signed_gain_wording as csg

# A calculator whose gain line is written only for the profitable case.
BAD = """export const SAMPLE = { price: "10", cost: "4" };
const usd = (n) => (n < 0 ? "-" : "") + "$" + Math.abs(n).toFixed(2);
export function compute(raw) {
  const m = Number(raw.price) - Number(raw.cost);
  return { findings: [{ title: "Each sale adds about " + usd(m) }] };
}
"""
GOOD = BAD.replace("return { findings: [{", "return { findings: m <= 0 ? [] : [{")
ZERO = """export const SAMPLE = { price: "10", cost: "4" };
const usd = (n) => (n < 0 ? "-" : "") + "$" + Math.abs(n).toFixed(2);
export function compute(raw) {
  const m = Number(raw.price) - Number(raw.cost);
  return { findings: m <= 0 ? [{ title: "Each sale costs more than it brings in (" + usd(m) + ")" }] : [] };
}
"""


def tree(files):
    tmp = Path(tempfile.mkdtemp())
    for rel, text in files.items():
        path = tmp / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text)
    return tmp


class SignedGainWording(unittest.TestCase):
    def test_flags_a_gain_word_before_a_negative_amount(self):
        hits, scanned = csg.scan(tree({"ventures/a/calc.mjs": BAD, "ventures/b/calc.mjs": GOOD}))
        self.assertEqual(scanned, 2)
        self.assertEqual([h["venture"] for h in hits], ["a"])
        self.assertIn("adds about -$", hits[0]["phrase"])

    def test_flags_costs_more_than_at_exactly_zero(self):
        # price x 0.4 = 4 = cost: the margin is exactly zero.
        src = ZERO.replace('price: "10"', 'price: "4"')
        hits, _ = csg.scan(tree({"ventures/z/calc.mjs": src}))
        self.assertEqual([h["venture"] for h in hits], ["z"])
        self.assertIn("($0.00)", hits[0]["phrase"])

    def test_skips_files_without_sample_and_compute(self):
        root = tree({"ventures/c/calc.mjs": "export const x = 1;\n", "ventures/d/other.mjs": BAD})
        self.assertEqual(csg.scan(root), ([], 0))

    def test_allowlist_and_exit_code(self):
        root = tree({"ventures/a/calc.mjs": BAD})
        hits, _ = csg.scan(root)
        self.assertEqual(csg.failures(hits, allow={"a": "reason"}), [])
        self.assertEqual(csg.main(["--root", str(root)]), 1)
        self.assertEqual(csg.main(["--root", str(tree({"ventures/b/calc.mjs": GOOD}))]), 0)

    def test_a_noun_net_label_is_not_flagged(self):
        src = BAD.replace("Each sale adds about ", "(net ")
        hits, _ = csg.scan(tree({"ventures/n/calc.mjs": src}))
        self.assertEqual(hits, [])


if __name__ == "__main__":
    unittest.main()
