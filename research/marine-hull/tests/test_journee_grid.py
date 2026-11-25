"""Milestone 7zzd: Journee's peaks on three grids (`experiments/run_journee_grid.py`)."""
import math
import os
import re
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
sys.path.insert(0, os.path.join(HERE, "..", "experiments"))

import run_journee_grid as jg  # noqa: E402

RESULTS = os.path.join(HERE, "..", "experiments", "results_journee_grid.txt")


class JourneeGridTests(unittest.TestCase):
    def test_window_is_centred_and_inside_7zu_sweep(self):
        """Each window has 25 points, is centred on 7zu's peak and lies inside 7zu's lambda/L 0.30 to 3.00 sweep."""
        for key, c in jg.CENTRE.items():
            w = jg.window(c)
            self.assertEqual(len(w), 2 * jg.HALF + 1)
            self.assertAlmostEqual(w[jg.HALF], c, places=9)
            self.assertGreaterEqual(w[0], 0.30)
            self.assertLessEqual(w[-1], 3.00)

    def test_order_recovers_constant_ratio_order_and_rejects_non_monotone(self):
        for p in (1.0, 2.0):
            f = [3.0 + 2.0 * h ** p for h in (1.5 ** 2, 1.5, 1.0)]
            self.assertAlmostEqual(jg.order(*f), p, places=9)
        self.assertIsNone(jg.order(1.0, 2.0, 1.5))
        self.assertIsNone(jg.order(1.0, 1.0, 1.0))

    def test_clean_set_is_journee_five(self):
        self.assertEqual(len(jg.CLEAN), 5)
        self.assertNotIn(("I", 0.4), jg.CLEAN)

    @unittest.skipUnless(os.path.exists(RESULTS), "run the experiment first")
    def test_results_carry_every_expectation_and_grid(self):
        text = open(RESULTS).read()
        for m in ("G0", "G1", "G2", "G3", "G4", "G5"):
            self.assertIsNotNone(re.search(rf"^{m} .*(held|refuted)", text, re.M), m)
        for g in jg.GRIDS:
            self.assertEqual(len(re.findall(rf"Fn 0\.\d P{g[0]:>2} S{g[1]:>2}:", text)), 6, g)
        self.assertNotIn(" EDGE", text)

    @unittest.skipUnless(os.path.exists(RESULTS), "run the experiment first")
    def test_coarse_grid_reproduces_7zu(self):
        """The (16, 30) peaks printed match 7zu's section B values to 0.01 sigma (G0, re-read from the file)."""
        text = open(RESULTS).read()
        for (h, fn), ref in jg.REF_7ZU.items():
            line = re.search(rf"^\s*{h} Fn {fn} P16 S30: .*$", text, re.M).group(0)
            got = [float(x) for x in re.findall(r"(?:GB\+F|NF-P|NF-PG) ([\d.]+)@", line)]
            for a, b in zip(got, ref):
                self.assertLess(abs(a - b), 0.01 + 1e-9, (h, fn))
            self.assertFalse(math.isnan(sum(got)))


if __name__ == "__main__":
    unittest.main()
