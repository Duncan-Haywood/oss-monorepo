import os
import unittest
import numpy as np
from eda_proposers import bench, hv, proposers, table

TAB = os.path.join(os.path.dirname(__file__), "..", "experiments", "table.jsonl")


class T(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.rows = table.load_table(TAB)
        cls.sp = table.Space(cls.rows)

    def test_hypervolume_known_values(self):
        self.assertAlmostEqual(hv.hypervolume([(0.5, 0.5)], (1, 1)), 0.25)
        self.assertAlmostEqual(hv.hypervolume([(0.2, 0.8), (0.8, 0.2)], (1, 1)), 0.2 * 0.8 + 0.2 * 0.6)  # 0.16 + 0.12 (L-shaped union)
        self.assertAlmostEqual(hv.hypervolume([(0.5, 0.5, 0.5)], (1, 1, 1)), 0.125)
        # two 3-D boxes overlapping: union = 0.125 + 0.125 - overlap(0.5*0.5*... )
        a, b = (0.5, 0.5, 0.0), (0.0, 0.5, 0.5)
        self.assertAlmostEqual(hv.hypervolume([a, b], (1, 1, 1)), 0.25 + 0.25 - 0.5 * 0.5 * 0.5)
        self.assertEqual(hv.hypervolume([(2, 2)], (1, 1)), 0.0)

    def test_hypervolume_ignores_dominated_points(self):
        base = hv.hypervolume([(0.3, 0.3, 0.3)], (1, 1, 1))
        self.assertAlmostEqual(hv.hypervolume([(0.3, 0.3, 0.3), (0.6, 0.6, 0.6), (0.3, 0.9, 0.3)], (1, 1, 1)), base)

    def test_nondominated(self):
        f = hv.nondominated([(1, 2), (2, 1), (2, 2), (1, 2)])
        self.assertEqual(sorted(f), [(1, 2), (2, 1)])

    def test_table_is_80_designs_and_normalised(self):
        self.assertEqual(len(self.sp.all()), 80)
        ys = [self.sp.evaluate(x) for x in self.sp.all()]
        self.assertTrue(all(0 <= v <= 1 for y in ys for v in y))
        self.assertEqual([min(y[i] for y in ys) for i in range(3)], [0, 0, 0])

    def test_fast_abc_is_never_smaller_than_default_in_the_table(self):
        g = {(r["p"], r["wb"]): r["cells"] for r in self.rows if r["abc"] == "gates"}
        f = {(r["p"], r["wb"]): r["cells"] for r in self.rows if r["abc"] == "fast"}
        self.assertTrue(all(f[k] > g[k] for k in g))

    def test_every_proposer_spends_exactly_the_budget_on_distinct_valid_designs(self):
        for cls in proposers.ALL:
            order = bench.run_once(self.sp, cls, 25, seed=3)
            self.assertEqual(len(order), 25, cls.name)
            self.assertEqual(len(set(order)), 25, cls.name)
            self.assertTrue(all(x in self.sp.t for x in order), cls.name)

    def test_budget_larger_than_space_is_not_asked_for_but_full_budget_finds_true_front(self):
        order = bench.run_once(self.sp, proposers.Random, 80, seed=0)
        self.assertAlmostEqual(bench.curve(self.sp, order, [80])[0], 1.0)

    def test_curve_is_monotone_in_budget(self):
        for cls in proposers.ALL:
            c = bench.curve(self.sp, bench.run_once(self.sp, cls, 30, seed=1), [5, 10, 20, 30])
            self.assertEqual(c, sorted(c), cls.name)

    def test_runs_are_reproducible_by_seed(self):
        a = bench.run_once(self.sp, proposers.TPE, 20, seed=7)
        self.assertEqual(a, bench.run_once(self.sp, proposers.TPE, 20, seed=7))

    def test_nsga2_ranks_and_crowding(self):
        ys = [(0, 1), (1, 0), (0.5, 0.5), (1, 1)]
        rank, crowd = proposers.ranks_and_crowding(ys)
        self.assertEqual(rank, [0, 0, 0, 1])
        self.assertEqual(crowd[0], float("inf"))
        self.assertGreater(crowd[2], 0)


if __name__ == "__main__":
    unittest.main()
