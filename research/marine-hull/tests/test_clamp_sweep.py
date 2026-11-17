import os
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "experiments"))
sys.path.insert(0, os.path.join(HERE, "..", "src"))

import run_clamp_sweep as C  # noqa: E402
import run_fresh_years as fy  # noqa: E402
import run_level_season as L  # noqa: E402


class ClampSweepTests(unittest.TestCase):
    def setUp(self):
        fy.load()
        self.p = "P+60"

    def test_c15_and_c30_are_the_earlier_rules(self):
        c = C.corrections(self.p, "E", L.REAL)
        d = L.corrections(self.p, "E", L.REAL)
        for g in L.LAGS:
            self.assertEqual(c[f"C15_{g}"], d[f"LC_{g}"])
            self.assertEqual(c[f"C30_{g}"], d[f"LW_{g}"])

    def test_every_half_width_bounds_its_ratios_and_nests(self):
        c = C.corrections(self.p, "L", L.REAL)
        for h, t in zip(C.H, C.TAGS):
            for x in c[f"{t}_2"]:
                self.assertTrue(1 - h - 1e-12 <= x <= 1 + h + 1e-12)
        # a wider clamp never moves a ratio further from its raw value
        r = L.raw(self.p, C.su.years_of("L", (2,)), L.REAL)[0]
        for a, b in zip(C.TAGS, C.TAGS[1:]):
            for x, y, z in zip(c[f"{a}_2"], c[f"{b}_2"], r):
                self.assertLessEqual(abs(y - z), abs(x - z) + 1e-12)

    def test_outside_share_falls_with_half_width(self):
        s = C.outside((self.p,))
        xs = [s[t] for t in C.TAGS]
        self.assertEqual(xs, sorted(xs, reverse=True))
        self.assertTrue(0 <= xs[-1] <= xs[0] <= 1)

    def test_best_breaks_ties_toward_the_narrower_clamp(self):
        tab = {f"{t}_{g}": 5 for t in C.TAGS for g in C.LAGS}
        self.assertEqual(C.best(tab)[0], C.TAGS[0])
        tab.update({f"C30_{g}": 6 for g in C.LAGS})
        self.assertEqual(C.best(tab), ("C30", 6))


if __name__ == "__main__":
    unittest.main()
