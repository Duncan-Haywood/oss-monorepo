import importlib.util
import math
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parents[1] / "experiments" / "freshlaw"
spec = importlib.util.spec_from_file_location("freshlaw_run", HERE / "run.py")
run = importlib.util.module_from_spec(spec)
spec.loader.exec_module(run)

G = [k / 100 for k in range(101)]


def linear_cell(Qn=1.0, Qp=3.0, n_li=1.6):
    return dict(g=G, Un=[0.1 * (1 - x) for x in G], Up=[4.4 - y for y in G], Qn=Qn, Qp=Qp, n_li=n_li, vlo=3.5, vhi=4.1)


class FreshLaw(unittest.TestCase):
    def test_pool_exponent_is_the_median_power(self):
        curves = [[0.001 * n ** b for n in range(1, 11)] for b in (0.3, 0.9, 0.5)]
        self.assertAlmostEqual(run.pool_exponent(curves), 0.5, places=9)
        self.assertIsNone(run.pool_exponent([[0.0] * 10]))

    def test_selector_splits_at_0_6(self):
        self.assertEqual(run.choose_law(0.85), "sqrt")
        self.assertEqual(run.choose_law(0.6), "sqrt")
        self.assertEqual(run.choose_law(0.27), "power")
        self.assertEqual(run.choose_law(None), "power")

    def test_law_reads_only_the_first_ten_cycles(self):
        lost = [0.002 * math.sqrt(n) for n in range(1, 11)] + [9.9] * 90
        self.assertAlmostEqual(run.law_l(lost, "sqrt", 99), 0.002 * math.sqrt(99), places=9)
        lost_p = [0.002 * n ** 0.4 for n in range(1, 11)] + [9.9] * 90
        self.assertAlmostEqual(run.law_l(lost_p, "power", 99), 0.002 * 99 ** 0.4, places=9)

    def test_map_predict_fades_with_loss_and_none_without(self):
        cell = linear_cell()
        self.assertEqual(run.map_predict(cell, [0.0] * 100, 5.0, "sqrt"), 5.0)
        small = run.map_predict(cell, [0.001 * math.sqrt(n) for n in range(1, 101)], 5.0, "sqrt")
        big = run.map_predict(cell, [0.004 * math.sqrt(n) for n in range(1, 101)], 5.0, "sqrt")
        self.assertLess(big, small)
        self.assertLess(small, 5.0)

    def test_true_map_matches_law_map_when_the_law_is_exact(self):
        cell = linear_cell()
        lost = [0.003 * math.sqrt(n) for n in range(1, 101)]
        self.assertAlmostEqual(run.map_predict(cell, lost, 1.0, "sqrt"), run.map_true(cell, lost), places=9)

    def test_gap_and_top(self):
        rows = [dict(score=s, raw10=r) for s, r in ((10, 1), (8, 3), (9, 2))]
        self.assertEqual(run.top(rows, "raw10", 1), {1})
        self.assertAlmostEqual(run.gap_of(rows, {1}), 0.2)
        self.assertEqual(run.gap_of(rows, {0, 1}), 0.0)


if __name__ == "__main__":
    unittest.main()
