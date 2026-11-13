import itertools
import os
import random
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from eda_gridorder import bench, orders  # noqa: E402
from eda_gridorder.bench import table  # noqa: E402

TAB = os.path.join(os.path.dirname(__file__), "..", "..", "eda-proposers", "experiments", "table.jsonl")


class T(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.sp = table.Space(table.load_table(TAB))

    def test_every_order_is_a_permutation(self):
        ds = self.sp.all()
        for name, (fn, stoch) in orders.ORDERS.items():
            o = fn(ds, self.sp.sizes, random.Random(1) if stoch else None)
            self.assertEqual(sorted(o), sorted(ds), name)

    def test_radical_inverse_known_values(self):
        self.assertEqual([orders.radical_inverse(i, 2) for i in (1, 2, 3, 4)], [0.5, 0.25, 0.75, 0.125])
        self.assertAlmostEqual(orders.radical_inverse(2, 3), 2 / 3)

    def test_farthest_point_second_pick_is_a_corner(self):
        sizes = [3, 3]
        ds = list(itertools.product(range(3), range(3)))
        o = orders.farthest_point(ds, sizes)
        self.assertEqual(o[0], (1, 1))
        self.assertIn(o[1], [(0, 0), (0, 2), (2, 0), (2, 2)])

    def test_deterministic_orders_repeat(self):
        ds, s = self.sp.all(), self.sp.sizes
        for fn in (orders.lexicographic, orders.halton, orders.farthest_point):
            self.assertEqual(fn(ds, s), fn(ds, s))

    def test_curve_is_monotone_and_ends_at_one(self):
        o = orders.random_order(self.sp.all(), self.sp.sizes, random.Random(0))
        c = bench.curve(self.sp, o, list(range(1, 81)))
        self.assertTrue(all(b >= a for a, b in zip(c, c[1:])))
        self.assertAlmostEqual(c[-1], 1.0)

    def test_curve_matches_slow_definition(self):
        o = orders.halton(self.sp.all(), self.sp.sizes)
        fast = bench.curve(self.sp, o, [5, 17])
        for b, v in zip([5, 17], fast):
            pts = bench.hv.nondominated([self.sp.evaluate(x) for x in o[:b]])
            self.assertAlmostEqual(v, bench.hv.hypervolume(pts, bench.REF) / bench.true_hv(self.sp))

    def test_first_budget_at(self):
        self.assertEqual(bench.first_budget_at([0.1, 0.5, 0.9, 1.0], 0.9), 3)

    def test_pinned_against_independent_recompute(self):
        # Values from an independent recomputation (exact fractions, own Halton, maximin and
        # hypervolume; quality audit 2026-11-13). They pin the bases, the maximin rule and the curve.
        ds, s = self.sp.all(), self.sp.sizes
        self.assertEqual(orders.halton(ds, s)[:3], [(4, 1, 0), (2, 3, 0), (6, 0, 1)])
        self.assertEqual(orders.farthest_point(ds, s)[:3], [(3, 2, 0), (7, 0, 1), (0, 4, 1)])
        got = {
            "halton": bench.curve(self.sp, orders.halton(ds, s), [8])[0],
            "farthest": bench.curve(self.sp, orders.farthest_point(ds, s), [4])[0],
            "lexicographic": bench.curve(self.sp, orders.lexicographic(ds, s), [16])[0],
        }
        self.assertAlmostEqual(got["halton"], 0.926, places=3)
        self.assertAlmostEqual(got["farthest"], 0.889, places=3)
        self.assertAlmostEqual(got["lexicographic"], 0.664, places=3)

    def test_bootstrap_interval_is_95_percent(self):
        vals = [float(i % 2) for i in range(400)]
        m, lo, hi = bench.mean_ci(vals)
        self.assertAlmostEqual(m, 0.5)
        # sd of the mean is 0.025, so a 95% interval is about 0.45 to 0.55, a 50% one 0.483 to 0.517
        self.assertLess(lo, 0.47)
        self.assertGreater(hi, 0.53)


if __name__ == "__main__":
    unittest.main()
