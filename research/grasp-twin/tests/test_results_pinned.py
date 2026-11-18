"""The README and whitepaper quote E5 from experiments/results.txt.

Quality census 2026-11-15: the README said the delta method "over-predicts"
(it under-predicts) and "within 5% for n >= 50" (0.92 at n=50). This pins the
quoted ratios to the committed table so a rerun that moves them fails here.
"""
import pathlib
import re
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]


class ResultsPinned(unittest.TestCase):
    def test_delta_ratios_quoted_match_table(self):
        text = (ROOT / "experiments" / "results.txt").read_text()
        block = text.split("== 5. Calibration budget", 1)[1]
        ratio = {int(m.group(1)): float(m.group(2))
                 for m in re.finditer(r"^(\d+)\s+[\d.]+\s+[\d.]+\s+[\d.]+\s+[\d.]+\s+([\d.]+)\s*$", block, re.M)}
        self.assertEqual(sorted(ratio), [5, 10, 20, 50, 100, 400, 1000])
        paper = (ROOT / "paper" / "whitepaper.md").read_text()
        readme = (ROOT / "README.md").read_text()
        self.assertIn("%.2f× at 5" % ratio[5], paper)
        self.assertIn("%.2f× at `n=5`" % ratio[5], readme)
        self.assertIn("under-predicts", readme)
        self.assertNotIn("over-predicts", readme)
        within5 = min(n for n in ratio if all(abs(ratio[k] - 1) <= 0.05 for k in ratio if k >= n))
        self.assertIn("within 5%% for `n ≥ %d`" % within5, paper)
        self.assertIn("within 5%% for `n ≥ %d`" % within5, readme)


if __name__ == "__main__":
    unittest.main()
