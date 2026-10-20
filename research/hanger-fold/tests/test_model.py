import math
import sys
import unittest
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from hanger_fold import model as M  # noqa: E402
from hanger_fold.learn import Logistic, Tree, sample_population, score_choice  # noqa: E402


class Fold(unittest.TestCase):
    def test_crease_set_closed_form(self):
        f = M.make("M", "shirt")
        bend = f.thick * 0.1 / (2 * M.FOLD_RADIUS)
        want = (1 - f.eps_y / bend) * (1 - math.exp(-M.T_STACK / M.TAU_STACK))
        self.assertAlmostEqual(M.crease_set(f), want, places=12)

    def test_fabric_that_springs_back_does_not_crease(self):
        f = M.make("M", "tee", dict(eps_y=10.0))
        self.assertEqual(M.fold_defect(f), 0.0)

    def test_crease_grows_with_stack_time_and_tighter_radius(self):
        f = M.make("M", "linen")
        self.assertLess(M.crease_set(f, t_stack=6), M.crease_set(f, t_stack=48))
        self.assertLess(M.crease_set(f, radius=1.0), M.crease_set(f, radius=0.25))

    def test_crease_bounded_by_stack_factor(self):
        f = M.make("M", "linen", dict(eps_y=1e-6))
        self.assertLess(M.crease_set(f), 1.0 - math.exp(-M.T_STACK / M.TAU_STACK) + 1e-9)


class Hang(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.sweater = M.make("M", "sweater")
        cls.sim_sw = M.simulate_hang(cls.sweater)
        cls.shirt = M.make("M", "shirt")
        cls.sim_sh = M.simulate_hang(cls.shirt)

    def test_set_is_zero_without_set_gain_or_time(self):
        self.assertEqual(M.hang_set(self.sweater, self.sim_sw, set_gain=0.0), 0.0)
        self.assertAlmostEqual(M.hang_set(self.sweater, self.sim_sw, t_hang=0.0), 0.0, places=12)

    def test_set_linear_in_gain_and_saturating_in_time(self):
        a = M.hang_set(self.sweater, self.sim_sw, set_gain=0.1)
        b = M.hang_set(self.sweater, self.sim_sw, set_gain=0.2)
        self.assertAlmostEqual(b, 2 * a, places=10)
        long = M.hang_set(self.sweater, self.sim_sw, t_hang=1e4)
        self.assertGreater(long, M.hang_set(self.sweater, self.sim_sw))
        self.assertAlmostEqual(long, M.hang_set(self.sweater, self.sim_sw, t_hang=2e4), places=8)

    def test_heavy_knit_stretches_more_than_woven(self):
        self.assertGreater(self.sim_sw["shoulder_strain"], 10 * self.sim_sh["shoulder_strain"])

    def test_decisions_on_archetypes(self):
        self.assertEqual(M.decide(self.sweater, self.sim_sw), "fold")
        self.assertEqual(M.decide(self.shirt, self.sim_sh), "hang")

    def test_stretch_penalty_can_flip_a_decision(self):
        f = M.make("M", "fleece")
        sim = M.simulate_hang(f)
        fold = M.fold_defect(f, depth=2.0)
        self.assertLess(M.hang_cost(f, sim, lam=0.0), fold)
        self.assertGreater(M.hang_cost(f, sim, lam=30.0), fold)


class Learners(unittest.TestCase):
    def test_tree_recovers_a_threshold(self):
        rng = np.random.default_rng(0)
        X = rng.uniform(0, 1, (200, 2))
        y = (X[:, 1] > 0.4).astype(float)
        t = Tree(1).fit(X, y)
        self.assertEqual(t.root[0], 1)
        self.assertAlmostEqual(t.root[1], 0.4, delta=0.03)
        self.assertGreaterEqual((t.predict(X) == y).mean(), 0.99)

    def test_logistic_separates_linear_data(self):
        rng = np.random.default_rng(1)
        X = rng.normal(0, 1, (300, 2))
        y = (X[:, 0] - 0.5 * X[:, 1] > 0).astype(float)
        self.assertGreater((Logistic().fit(X, y).predict(X) == y).mean(), 0.95)

    def test_regret_of_oracle_is_zero(self):
        h, c = np.array([1.0, 3.0, 2.0]), np.array([2.0, 1.0, 5.0])
        y = (h <= c).astype(float)
        r = score_choice(y, y, h, c)
        self.assertEqual((r["acc"], r["regret"]), (1.0, 0.0))
        self.assertAlmostEqual(score_choice(1 - y, y, h, c)["regret"], np.mean([1.0, 2.0, 3.0]))

    def test_population_is_reproducible(self):
        a, b = sample_population(5, seed=3), sample_population(5, seed=3)
        self.assertEqual([x.garment for x in a], [x.garment for x in b])


if __name__ == "__main__":
    unittest.main()
