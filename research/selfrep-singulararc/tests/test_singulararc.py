import math
import pathlib
import sys
import unittest

here = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(here / "src"))
sys.path.insert(0, str(here.parent / "selfrep-satmarket" / "src"))
from selfrep_singulararc import model as sa
from selfrep_satmarket import model as sm


class T(unittest.TestCase):
    def test_last_phase_is_one_over_k(self):
        sol = sa.solve(0.02, 1000.0, 600.0)
        self.assertAlmostEqual(sol["te"], 550.0)

    def test_matching_condition(self):
        k, c, T_ = 0.02, 1000.0, 600.0
        s = sa.solve(k, c, T_)
        lhs = math.exp(k * s["t1"])
        rhs = c * (1 - math.exp(-k * (s["te"] - s["t1"])))
        self.assertAlmostEqual(lhs, rhs, places=6)

    def test_fleet_continuous_at_joins(self):
        k, c, T_ = 0.02, 1000.0, 600.0
        s = sa.solve(k, c, T_)
        for t in (s["t1"], s["te"]):
            a = sa.fleet_and_u(k, c, T_, t - 1e-7, s)[0]
            b = sa.fleet_and_u(k, c, T_, t + 1e-7, s)[0]
            self.assertAlmostEqual(a / b, 1.0, places=4)

    def test_output_grows_linearly_on_singular_arc(self):
        k, c, T_ = 0.02, 1000.0, 600.0
        s = sa.solve(k, c, T_)
        g = lambda t: (lambda n, u: (1 - u) * n)(*sa.fleet_and_u(k, c, T_, t, s))
        t = 0.5 * (s["t1"] + s["te"])
        self.assertAlmostEqual((g(t + 1) - g(t)), k * c, places=6)

    def test_beats_every_bang_bang_and_perturbations(self):
        k, c, T_ = 0.02, 1000.0, 600.0
        p = sm.Params(k=k, c=c, horizon=T_, dt=0.25)
        pol, _ = sa.policy(k, c, T_)
        j = sm.run(p, pol)[0]
        self.assertGreater(j, sm.best_switch(p, step=1.0)[1])
        for dt1 in (-20.0, 20.0):  # shift the whole policy in time: should not help
            self.assertLessEqual(sm.run(p, lambda t, n: pol(t + dt1, n))[0], j + 1e-6)

    def test_matches_linear_case_for_huge_market(self):
        k, T_ = 0.02, 600.0
        s = sa.solve(k, 1e12, T_)
        self.assertAlmostEqual(s["t1"], s["te"], delta=1.0)  # no interior arc: switch at T - 1/k

    def test_no_growth_phase_when_market_tiny(self):
        s = sa.solve(0.02, 0.5, 600.0, n0=1.0)
        self.assertEqual(s["t1"], 0.0)

    def test_value_agrees_with_euler_run(self):
        k, c, T_ = 0.02, 1000.0, 600.0
        p = sm.Params(k=k, c=c, horizon=T_, dt=0.1)
        pol, _ = sa.policy(k, c, T_)
        je = sm.run(p, pol)[0]
        jc, _ = sa.value(1.0, k, c, T_)
        self.assertLess(abs(je - jc) / jc, 0.005)


if __name__ == "__main__":
    unittest.main()
