import math
import pathlib
import sys
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / "src"))
from selfrep_resalecurve.model import Params, best_switch, bang_bang, dp_policy, dp_solve, resale, value

P = Params(k=0.1, horizon=60.0, dt=0.5)


class ResaleCurve(unittest.TestCase):
    def test_first_machine_price_is_s_and_total_is_capped(self):
        f = resale(4.0, 100.0)
        self.assertAlmostEqual(f(1e-6) / 1e-6, 4.0, places=3)
        self.assertLess(f(1e9), 4.0 * 100.0 + 1e-9)
        self.assertAlmostEqual(f(1e9), 400.0)

    def test_large_m_approaches_linear(self):
        self.assertAlmostEqual(resale(4.0, 1e12)(7.0), resale(4.0, math.inf)(7.0), places=6)

    def test_value_adds_terminal_of_final_fleet(self):
        term = resale(3.0, 50.0)
        j, g, n, _ = value(P, bang_bang(40.0), term)
        self.assertAlmostEqual(j, g + term(n))

    def test_linear_switch_matches_closed_form(self):
        ts, _ = best_switch(P, resale(4.0, math.inf), step=0.5)   # T - 1/k + s/a = 54
        self.assertLessEqual(abs(ts - 54.0), 1.0)

    def test_concave_resale_never_switches_later_than_linear(self):
        tl = best_switch(P, resale(4.0, math.inf), step=0.5)[0]
        tc = best_switch(P, resale(4.0, 20.0), step=0.5)[0]
        self.assertLessEqual(tc, tl + 1e-9)

    def test_dp_close_to_bang_bang(self):
        q = Params(k=0.1, c=5.0, horizon=30.0, dt=1.0)
        term = resale(3.0, 40.0)
        jb = best_switch(q, term)[1]
        _, pol, grid = dp_solve(q, term, n_points=120, u_levels=11)
        self.assertGreater(value(q, dp_policy(q, pol, grid), term)[0], 0.97 * jb)


if __name__ == "__main__":
    unittest.main()
