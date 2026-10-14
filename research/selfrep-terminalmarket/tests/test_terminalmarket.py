import math
import pathlib
import sys
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / "src"))
from selfrep_terminalmarket.model import Params, best_switch, bang_bang, dp_policy, dp_solve, value

P = Params(k=0.1, horizon=60.0, dt=0.5)          # linear market, 1/k = 10 h


class TerminalMarket(unittest.TestCase):
    def test_zero_terminal_value_matches_satmarket_value(self):
        from selfrep_satmarket.model import run
        j, g, n, _ = value(P, bang_bang(50.0), 0.0)
        self.assertAlmostEqual(j, run(P, bang_bang(50.0))[0])

    def test_terminal_value_adds_s_times_fleet(self):
        j, g, n, _ = value(P, bang_bang(50.0), 3.0)
        self.assertAlmostEqual(j, g + 3.0 * n)

    def test_linear_market_switch_matches_selfrep_terminal_closed_form(self):
        ts, _ = best_switch(P, 4.0, step=0.5)    # goods phase 1/k - s/a = 6, so ts = 54
        self.assertLessEqual(abs(ts - 54.0), 1.0)

    def test_dp_beats_or_matches_bang_bang_up_to_discretisation(self):
        q = Params(k=0.1, c=5.0, horizon=30.0, dt=1.0)
        s = 3.0
        _, jb = best_switch(q, s)
        vdp, pol, grid = dp_solve(q, s, n_points=120, u_levels=11)
        jd = value(q, dp_policy(q, pol, grid), s)[0]
        self.assertGreater(jd, 0.97 * jb)

    def test_dp_value_zero_horizon_is_terminal_value(self):
        q = Params(k=0.1, c=5.0, horizon=1.0, dt=1.0)
        vdp, _, _ = dp_solve(q, 2.0, n_points=20, u_levels=3)
        self.assertGreaterEqual(vdp, 2.0 - 1e-9)


if __name__ == "__main__":
    unittest.main()
