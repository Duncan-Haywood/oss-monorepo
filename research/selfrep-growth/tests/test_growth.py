import math
import pathlib
import sys
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / "src"))
from selfrep_growth.model import Params, crossover_units, doubling_time_free, effective_doubling, simulate, time_to_reach_ode
from selfrep_growth.params import printer_copy


class Growth(unittest.TestCase):
    def test_free_doubling_time(self):
        p = Params(work_h=50, vit_cost=1, budget=1e9, fail=0.2)
        self.assertAlmostEqual(doubling_time_free(p), 50 * math.log(2) / 0.8)

    def test_deterministic_sim_when_unconstrained(self):
        # no failures, no variance, plenty of budget: the fleet doubles every work_h
        p = Params(work_h=10, vit_cost=1, budget=1e9, cv=0)
        self.assertAlmostEqual(simulate(p, 1, 16), 40.0, places=6)

    def test_budget_limited_is_linear(self):
        # budget buys one copy per 100 h; work is short, so growth is linear
        p = Params(work_h=1, vit_cost=100, budget=1.0, cv=0)
        self.assertAlmostEqual(simulate(p, 1, 11), 1000, delta=15)
        self.assertAlmostEqual(time_to_reach_ode(p, 1, 11), 1000, delta=1)

    def test_more_budget_never_slower(self):
        t = [simulate(Params(50, 170, b, fail=0.1), 1, 8, seed=3) for b in (0.5, 1, 2, 4)]
        self.assertEqual(t, sorted(t, reverse=True))

    def test_crossover(self):
        self.assertAlmostEqual(crossover_units(Params(50, 170, 17)), 5.0)

    def test_stochastic_median_vs_ode_in_free_regime(self):
        p = Params(work_h=50, vit_cost=1, budget=1e9, fail=0.0, cv=0.2)
        _, med, _ = effective_doubling(p, 1, 16, reps=50)
        ode = time_to_reach_ode(p, 1, 16) / 4
        self.assertGreater(med, ode * 0.9)
        self.assertLess(med, ode * 1.6)

    def test_params_from_closure(self):
        w, v, c, tot = printer_copy()
        self.assertGreater(w, 6)
        self.assertAlmostEqual(v, (1 - c) * tot)


if __name__ == "__main__":
    unittest.main()
