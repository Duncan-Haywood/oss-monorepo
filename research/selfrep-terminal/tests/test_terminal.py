import pathlib
import sys
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / "src"))
from selfrep_terminal.model import best_switch, closed_form, value
from selfrep_reinvest.model import Params

P = Params(work_h=10.0, vit_cost=1.0, cash_limited=False, horizon=60.0, dt=0.02)  # k = 0.1, 1/k = 10


class Terminal(unittest.TestCase):
    def test_zero_value_recovers_reinvest(self):
        ts, j = closed_form(P, 0.0)
        self.assertAlmostEqual(ts, 50.0)
        self.assertAlmostEqual(j, 1.0 * 2.718281828459045 ** 5 * 10.0, places=6)

    def test_terminal_value_shortens_goods_phase(self):
        ts, _ = closed_form(P, 4.0)          # goods phase 10 - 4 = 6
        self.assertAlmostEqual(ts, 54.0)

    def test_never_switch_above_threshold(self):
        ts, j = closed_form(P, 12.0)         # s > a/k = 10
        self.assertEqual(ts, 60.0)
        self.assertAlmostEqual(j, 2.718281828459045 ** 6 * 12.0, places=6)

    def test_numeric_switch_matches_closed_form(self):
        for s in (0.0, 4.0, 8.0):
            ts_c, _ = closed_form(P, s)
            ts_n, _ = best_switch(P, s, step=0.5)
            self.assertLessEqual(abs(ts_n - ts_c), 1.0)

    def test_closed_form_is_a_maximum(self):
        ts, _ = closed_form(P, 4.0)
        self.assertGreater(value(P, ts, 4.0), value(P, ts - 3, 4.0))
        self.assertGreater(value(P, ts, 4.0), value(P, ts + 3, 4.0))

    def test_short_horizon_goods_only(self):
        q = Params(work_h=10.0, vit_cost=1.0, cash_limited=False, horizon=5.0, dt=0.02)
        self.assertEqual(closed_form(q, 0.0)[0], 0.0)


if __name__ == "__main__":
    unittest.main()
