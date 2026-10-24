import os
import sys
import unittest

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from eda_screenxfer import models, screen  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
ROWS = models.load(os.path.join(HERE, "..", "experiments", "dataset.jsonl"))
X, Y, NAMES = models.matrix(ROWS)
FAM = np.array([r["family"] for r in ROWS])
CYC = np.array([r["cycles"] for r in ROWS], float)


class HypervolumeTests(unittest.TestCase):
    def test_known_values(self):
        self.assertAlmostEqual(screen.hv2([(0.5, 0.5)]), 0.6 * 0.6)
        self.assertAlmostEqual(screen.hv2([(0.0, 0.5), (0.5, 0.0)]), 1.1 * 0.6 + 0.6 * 0.5)
        self.assertAlmostEqual(screen.hv2([(0.5, 0.5), (0.6, 0.6)]), 0.36)  # dominated point adds nothing
        self.assertEqual(screen.hv2([]), 0.0)

    def test_fronts(self):
        O = np.array([[0, 1], [1, 0], [1, 1], [2, 2]], float)
        self.assertEqual(list(screen.fronts(O)), [0, 0, 1, 2])


class ScreenTests(unittest.TestCase):
    def setUp(self):
        self.idx = np.where(FAM == "mac")[0]
        self.other = np.where(FAM != "mac")[0]

    def run_screen(self, cells, **kw):
        i = self.idx
        return screen.screen(X[i], CYC[i], cells, X[self.other], Y[self.other], 8, **kw)

    def test_orders_are_distinct_and_of_budget_length(self):
        o = self.run_screen(Y[self.idx], kind="ridge")
        self.assertEqual(len(o), 8)
        self.assertEqual(len(set(o)), 8)

    def test_unmeasured_cells_are_never_read(self):
        # Replacing the true cells of every design the screen has not yet measured must not change its choices
        # until it measures them: check by running with the true cells, then with cells poisoned for the rest of
        # the order, and expecting the same first four picks (poisoning only designs picked later).
        base = self.run_screen(Y[self.idx], kind="ridge")
        poisoned = Y[self.idx].copy()
        poisoned[base[4:]] = 1e9
        again = self.run_screen(poisoned, kind="ridge")
        self.assertEqual(base[:4], again[:4])

    def test_spread_first_picks_k_designs(self):
        o = self.run_screen(Y[self.idx], kind="ridge", k=3)
        Z = screen.feature_space(X[self.idx])
        self.assertEqual(o[:3], screen.spread(Z, 3))

    def test_beats_random_on_average(self):
        i = self.idx
        O = screen.normalise(Y[i], CYC[i])
        true = screen.hv2(O)
        o = self.run_screen(Y[i], kind="ridge")
        rnd = [screen.hv_curve(O, screen.random_order(O, 8, np.random.RandomState(s)), true)[-1] for s in range(30)]
        self.assertGreater(screen.hv_curve(O, o, true)[-1], np.mean(rnd))

    def test_constant_model_runs(self):
        self.assertEqual(len(set(self.run_screen(Y[self.idx], kind="mean"))), 8)


if __name__ == "__main__":
    unittest.main()
