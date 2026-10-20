import pathlib
import sys
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / "src"))
from selfrep_exactdp.model import Params, best_switch, controls, exact_dp, path_policy, value


def small(c=20.0):
    return Params(k=0.1, c=c, horizon=30.0, dt=1.0)


class ExactDp(unittest.TestCase):
    def test_controls_land_on_grid(self):
        p = small()
        m = 4
        r = 1 + p.k * p.dt
        for j, u in enumerate(controls(p, m)):
            self.assertAlmostEqual((1 + p.k * u * p.dt), r ** (j / m), places=12)
        self.assertEqual(controls(p, m)[0], 0.0)
        self.assertAlmostEqual(controls(p, m)[-1], 1.0, places=12)

    def test_table_equals_policy_value(self):
        p = small()
        for m in (1, 2, 4):
            vt, pol, grid = exact_dp(p, 3.0, m=m)
            j = value(p, path_policy(p, pol, grid, m), 3.0)[0]
            self.assertAlmostEqual(vt, j, delta=1e-9 * j)

    def test_m1_is_best_switch(self):
        p = small()
        for s in (0.0, 3.0):
            vt = exact_dp(p, s, m=1)[0]
            self.assertAlmostEqual(vt, best_switch(p, s)[1], delta=1e-9 * vt)

    def test_refinement_never_lowers_value(self):
        p = small()
        vals = [exact_dp(p, 0.0, m=m)[0] for m in (1, 2, 4, 8)]
        for a, b in zip(vals, vals[1:]):
            self.assertGreaterEqual(b, a - 1e-9)

    def test_linear_market_with_large_resale_value_copies_throughout(self):
        p = Params(k=0.1, horizon=30.0, dt=1.0)
        vt = exact_dp(p, 50.0, m=2)[0]
        self.assertAlmostEqual(vt, 50.0 * 1.1 ** 30, delta=1e-9 * vt)


if __name__ == "__main__":
    unittest.main()
