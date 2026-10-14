import math
import pathlib
import sys
import unittest

here = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(here / "src"))
sys.path.insert(0, str(here.parent / "selfrep-reinvest" / "src"))
from selfrep_satmarket.model import (Params, bang_bang, best_switch, constant, dp_policy, dp_solve,
                                     optimise_piecewise, revenue, run)
from selfrep_reinvest import model as linear

BASE = dict(k=0.1, horizon=60.0, dt=0.5)


class SatMarket(unittest.TestCase):
    def test_revenue_limits(self):
        p = Params(k=0.1, c=100.0)
        self.assertAlmostEqual(revenue(p, 0.0), 0.0)
        self.assertAlmostEqual(revenue(p, 1e-3), 1e-3, places=6)      # linear for small output
        self.assertLess(revenue(p, 1e6), 100.0 + 1e-9)                 # saturates at a c
        self.assertGreater(revenue(p, 1e6), 99.99)

    def test_all_goods(self):
        p = Params(**BASE, c=10.0)
        g, n, _ = run(p, constant(0.0))
        self.assertAlmostEqual(g, 10.0 * (1 - math.exp(-0.1)) * 60.0, places=6)
        self.assertAlmostEqual(n, 1.0)

    def test_matches_linear_model_when_c_infinite(self):
        p = Params(k=0.1, horizon=60.0, dt=0.5)
        q = linear.Params(work_h=10.0, vit_cost=1.0, cash_limited=False, horizon=60.0, dt=0.5)
        for ts in (0.0, 20.0, 50.0):
            self.assertAlmostEqual(run(p, bang_bang(ts))[0], linear.run(q, linear.bang_bang(ts))[0], places=6)

    def test_dp_dominates_simple_policies(self):
        p = Params(**BASE, c=50.0)
        v, pol, grid = dp_solve(p, n_points=200, u_levels=21)
        gd = run(p, dp_policy(p, pol, grid))[0]
        _, gb = best_switch(p)
        self.assertGreaterEqual(gd, gb * 0.999)
        self.assertAlmostEqual(v, gd, delta=0.01 * gd)               # table and simulated policy agree

    def test_dp_is_bang_bang_when_linear(self):
        p = Params(**BASE)
        v, pol, grid = dp_solve(p, n_points=200, u_levels=11)
        _, path_dp = None, run(p, dp_policy(p, pol, grid))[2]
        interior = sum(1 for u in path_dp if 0.1 < u < 0.9)
        self.assertLessEqual(interior, 6)                            # at most a few steps near the switch

    def test_saturation_creates_interior_control(self):
        p = Params(**BASE, c=20.0)
        v, pol, grid = dp_solve(p, n_points=200, u_levels=21)
        path = run(p, dp_policy(p, pol, grid))[2]
        self.assertGreater(sum(1 for u in path if 0.1 < u < 0.9), 6)

    def test_local_search_never_beats_dp_by_more_than_error(self):
        p = Params(**BASE, c=50.0)
        v, pol, grid = dp_solve(p, n_points=200, u_levels=21)
        gd = run(p, dp_policy(p, pol, grid))[0]
        ts, _ = best_switch(p)
        start = [1.0 if i / 12 * 60 < ts else 0.0 for i in range(12)]
        _, gp = optimise_piecewise(p, m=12, start=start)
        self.assertLessEqual(gp, gd * 1.005)

    def test_dp_value_grows_with_capacity(self):
        vs = [dp_solve(Params(**BASE, c=c), n_points=100, u_levels=11)[0] for c in (10.0, 100.0, 1000.0)]
        self.assertLess(vs[0], vs[1]); self.assertLess(vs[1], vs[2])


if __name__ == "__main__":
    unittest.main()
