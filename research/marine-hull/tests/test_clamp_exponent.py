import math
import os
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "experiments"))
sys.path.insert(0, os.path.join(HERE, "..", "src"))

import run_clamp_exponent as E  # noqa: E402
import run_fresh_years as fy  # noqa: E402
import run_k_aware_clamp as K  # noqa: E402
import run_level_season as L  # noqa: E402
import run_summer_shift as ss  # noqa: E402


class ClampExponentTests(unittest.TestCase):
    def setUp(self):
        fy.load()

    def test_sets(self):
        self.assertEqual([len(E.SETS[k]) for k in E.KS], [5, 10, 10, 5, 1])
        self.assertEqual(E.SETS[5], ((1, 2, 3, 4, 5),))

    def test_exponents(self):
        r = (1.0,) * 6 + (1.08,) * 6  # spread 0.04
        for k in E.KS:
            self.assertAlmostEqual(E.half_width("AP", r, k), 0.04)
            self.assertAlmostEqual(E.half_width("AK", r, k), min(0.40, 0.04 * math.sqrt(k)))
            self.assertAlmostEqual(E.half_width("A1", r, k), 0.04 * k)
        self.assertAlmostEqual(E.half_width("A1", (1.5,) * 12, 4), 0.40)
        self.assertAlmostEqual(E.half_width("A1", (1.0,) * 12, 5), 0.02)
        self.assertEqual(E.half_width("C15", r, 3), 0.15)

    def test_matches_6zzzb_corrections(self):
        a = E.corrections("P-30", "E", L.REAL)
        b = K.corrections("P-30", "E", L.REAL)
        for k in (2, 3):
            for s in E.SETS[k]:
                for t in ("AP", "AK", "C15"):
                    self.assertEqual(a[E.rname(t, s)], b[K.rname(t, s)])

    def test_equal_weight_counts_each_point_once(self):
        # two points, one rule that dominates B at one point only, in every cell: half of each cell
        sh = E.SHAPES[0]
        cells = {}
        for p, ok in (("A", True), ("B", False)):
            for yrs in ss.HALVES.values():
                for yr in yrs:
                    for c in E.PACKS:
                        cells[(c, p, yr) + sh] = {E.BASE: (100.0, 10.0, None),
                                                  "R": (101.0 if ok else 99.0, 10.0, None)}
        old = ss.RULES
        try:
            ss.RULES = ("R",)
            got = E.equal_weight(cells, ("A", "B"), (sh,))
        finally:
            ss.RULES = old
        self.assertAlmostEqual(got["R"], 0.5 * len(ss.HALVES) * len(E.PACKS))


if __name__ == "__main__":
    unittest.main()
