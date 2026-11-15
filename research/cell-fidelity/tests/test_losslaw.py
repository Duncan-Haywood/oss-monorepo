import importlib.util
import math
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parents[1] / "experiments" / "losslaw"
spec = importlib.util.spec_from_file_location("losslaw_run", HERE / "run.py")
run = importlib.util.module_from_spec(spec)
spec.loader.exec_module(run)

G = [k / 100 for k in range(101)]


def linear_cell(Qn=1.0, Qp=3.0, n_li=1.6):
    # negative-limited linear cell (as in test_mapscreen): lost lithium shrinks the window
    return dict(g=G, Un=[0.1 * (1 - x) for x in G], Up=[4.4 - y for y in G], Qn=Qn, Qp=Qp, n_li=n_li, vlo=3.5, vhi=4.1)


class LossLaw(unittest.TestCase):
    def test_sqrt_law_recovers_an_offset_sqrt(self):
        lost = [-0.001 + 0.003 * math.sqrt(n) for n in range(1, 11)]
        a, b = run.sqrt_law_fit(lost)
        self.assertAlmostEqual(a, -0.001, places=9)
        self.assertAlmostEqual(b, 0.003, places=9)
        self.assertAlmostEqual(run.sqrt_law_at((a, b), 99), -0.001 + 0.003 * math.sqrt(99), places=9)

    def test_sqrt_law_needs_three_positive_points(self):
        self.assertIsNone(run.sqrt_law_fit([0.0] * 10))
        self.assertIsNone(run.sqrt_law_fit([0.0] * 8 + [1e-3, 2e-3]))

    def test_sqrt_law_grows_slower_than_the_power_law_on_near_linear_loss(self):
        lost = [0.002 * n ** 0.85 for n in range(1, 11)]
        self.assertLess(run.sqrt_law_at(run.sqrt_law_fit(lost), 99), run.S.power_at(run.S.power_fit(lost), 99))

    def test_no_loss_predicts_no_fade(self):
        self.assertEqual(run.map_predict_sqrt(linear_cell(), [0.0] * 10, 5.0), 5.0)

    def test_more_loss_more_fade_and_floor_at_cycle_nine(self):
        cell = linear_cell()
        small = run.map_predict_sqrt(cell, [0.001 * math.sqrt(n) for n in range(1, 11)], 5.0)
        big = run.map_predict_sqrt(cell, [0.004 * math.sqrt(n) for n in range(1, 11)], 5.0)
        self.assertLess(big, small)
        self.assertLess(small, 5.0)
        # a curve that falls after cycle 9 cannot predict a gain: L(99) is floored at the cycle-9 loss
        falling = [0.01] * 9 + [0.0005]
        self.assertLessEqual(run.map_predict_sqrt(cell, falling, 5.0), 5.0 + 1e-12)

    def test_sign_test(self):
        self.assertAlmostEqual(run.sign_p(13, 13), 2 / 2 ** 13)
        self.assertAlmostEqual(run.sign_p(12, 13), 2 * 14 / 2 ** 13)
        self.assertEqual(run.sign_p(6, 13), 1.0)

    def test_test_set_is_the_seventeen_minus_the_diagnostic(self):
        self.assertEqual(len(run.TEST), 13)
        self.assertFalse(set(run.TEST) & set(run.S.DIAG))


if __name__ == "__main__":
    unittest.main()
