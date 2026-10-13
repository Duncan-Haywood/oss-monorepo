import math
import pathlib
import sys
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / "src"))
from selfrep_reinvest.model import (Params, analytic_unconstrained, best_switch, bang_bang, constant,
                                    optimise_piecewise, piecewise, run, smooth)

FREE = dict(work_h=10.0, vit_cost=1.0, cash_limited=False, horizon=60.0, dt=0.05)


class Reinvest(unittest.TestCase):
    def test_all_goods_is_a_n_t(self):
        p = Params(**FREE)
        g, n, _, _ = run(p, constant(0.0))
        self.assertAlmostEqual(g, 60.0)
        self.assertAlmostEqual(n, 1.0)

    def test_switch_matches_closed_form(self):
        p = Params(**FREE)
        ts, J = analytic_unconstrained(p)
        self.assertAlmostEqual(ts, 50.0)
        self.assertAlmostEqual(run(p, bang_bang(ts))[0] / J, 1.0, delta=0.03)
        # the closed-form switch time beats nearby times
        for other in (30.0, 42.0, 58.0):
            self.assertLess(run(p, bang_bang(other))[0], run(p, bang_bang(ts))[0])

    def test_grid_switch_near_closed_form(self):
        p = Params(**FREE)
        ts, g = best_switch(p, step=1.0)
        self.assertAlmostEqual(ts, 50.0, delta=2.0)

    def test_failures_slow_growth(self):
        a = run(Params(**FREE), constant(1.0))[1]
        b = run(Params(**{**FREE, "fail": 0.5}), constant(1.0))[1]
        self.assertAlmostEqual(a, math.exp(6.0), delta=0.05 * math.exp(6.0))
        self.assertLess(b, a)

    def test_no_cash_no_copies(self):
        p = Params(work_h=10.0, vit_cost=1.0, horizon=20.0)
        g, n, m, _ = run(p, constant(1.0))
        self.assertEqual(n, 1.0)           # nothing to pay with, so no copy is ever started
        self.assertAlmostEqual(g, 20.0)    # all machine time falls through to goods

    def test_cash_never_negative_and_resale_helps(self):
        p0 = Params(work_h=10.0, vit_cost=5.0, cash0=5.0, horizon=100.0)
        p1 = Params(work_h=10.0, vit_cost=5.0, cash0=5.0, horizon=100.0, resale=1.0)
        self.assertGreaterEqual(run(p0, constant(1.0))[2], 0.0)
        self.assertGreater(run(p1, constant(0.5))[1], run(p0, constant(0.5))[1])

    def test_piecewise_optimum_not_worse_than_switch(self):
        p = Params(**{**FREE, "dt": 0.25})
        ts, g = best_switch(p, step=2.0)
        lv, gp = optimise_piecewise(p, k=12, start=[1.0 if i / 12 * 60 < ts else 0.0 for i in range(12)])
        self.assertGreaterEqual(gp, run(p, piecewise([1.0 if i / 12 * 60 < ts else 0.0 for i in range(12)], 60.0))[0] - 1e-9)

    def test_bang_bang_beats_constant_and_smooth_is_close(self):
        p = Params(**FREE)
        _, gb = best_switch(p, step=1.0)
        gc = max(run(p, constant(u / 10))[0] for u in range(11))
        self.assertGreater(gb, gc)
        gs = max(run(p, smooth(ts, 2.0))[0] for ts in range(30, 60, 2))
        self.assertLess(gs, gb * 1.001)


if __name__ == "__main__":
    unittest.main()
