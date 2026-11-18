import importlib.util
import math
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parents[1] / "experiments" / "mapscreen"
spec = importlib.util.spec_from_file_location("mapscreen_run", HERE / "run.py")
run = importlib.util.module_from_spec(spec)
spec.loader.exec_module(run)

G = [k / 100 for k in range(101)]


def linear_cell(Qn=1.0, Qp=3.0, n_li=1.6):
    # negative-limited linear cell (see test_balance): lost lithium shrinks the window
    return dict(g=G, Un=[0.1 * (1 - x) for x in G], Up=[4.4 - y for y in G], Qn=Qn, Qp=Qp, n_li=n_li, vlo=3.5, vhi=4.1)


class MapScreen(unittest.TestCase):
    def test_power_fit_recovers_a_power_law(self):
        lost = [0.002 * n ** 0.7 for n in range(1, 11)]
        a, b = run.power_fit(lost)
        self.assertAlmostEqual(a, 0.002, places=9)
        self.assertAlmostEqual(b, 0.7, places=9)
        self.assertAlmostEqual(run.power_at((a, b), 99), 0.002 * 99 ** 0.7, places=9)

    def test_power_fit_needs_three_positive_points(self):
        self.assertIsNone(run.power_fit([0.0] * 10))
        self.assertIsNone(run.power_fit([0.0] * 8 + [1e-3, 2e-3]))

    def test_no_loss_means_no_fade(self):
        self.assertEqual(run.map_predict(linear_cell(), [0.0] * 10, 12.0), 12.0)

    def test_map_predict_scales_cycle_ten_by_the_open_circuit_ratio(self):
        b = linear_cell()
        lost = [0.001 * n for n in range(1, 11)]
        a, p = run.power_fit(lost)
        e9, _ = run.ocv_energy(1.6 - lost[8], b)
        e99, _ = run.ocv_energy(1.6 - a * 99 ** p, b)
        self.assertTrue(math.isclose(run.map_predict(b, lost, 10.0), 10.0 * e99 / e9, rel_tol=1e-12))
        self.assertLess(run.map_predict(b, lost, 10.0), 10.0)

    def test_sqrt_extrapolate_is_exact_on_a_sqrt_line(self):
        wh = [5.0 - 0.2 * math.sqrt(n) for n in range(1, 11)]
        self.assertAlmostEqual(run.sqrt_extrapolate(wh), 5.0 - 0.2 * 10.0, places=9)

    def test_union_gap(self):
        rows = [dict(raw10=10 - i, map=i, sqrt=0, score=s) for i, s in enumerate([5, 4, 3, 2, 1, 1, 9])]
        g, picked = run.union(rows, "map", m=1)
        self.assertEqual(picked, [0, 6])
        self.assertEqual(g, 0.0)
        g2, _ = run.union(rows, "sqrt", m=1)
        self.assertAlmostEqual(g2, 1 - 5 / 9)

    def test_verdict_bars(self):
        C = {str(i): dict(rho_map=0.9, rho_sqrt=0.5, mae_fade_map=0.01, mae_fade_sqrt=0.1, gap_map=0.0, gap_sqrt=0.0) for i in range(17)}
        V = run.verdicts(C)
        self.assertEqual((V["H108"], V["H109"], V["H110"], V["H111"]), ("supported",) * 4)
        C["0"]["gap_map"] = 0.05
        self.assertEqual(run.verdicts(C)["H110"], "refuted")
        self.assertEqual(run.verdicts(C)["H111"], "refuted")


if __name__ == "__main__":
    unittest.main()
