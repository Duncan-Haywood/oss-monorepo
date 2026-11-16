import importlib.util
import math
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parents[1] / "experiments" / "kinetic"
spec = importlib.util.spec_from_file_location("kinetic_run", HERE / "run.py")
run = importlib.util.module_from_spec(spec)
spec.loader.exec_module(run)

G = [1e-4 + k * (1 - 2e-4) / 400 for k in range(401)]


def linear_cell():
    return dict(g=G, Un=[0.5 - 0.5 * x for x in G], Up=[4.5 - y for y in G], Qn=0.1, Qp=0.1, n_li=0.09, vlo=3.0, vhi=4.1)


def kinetic_curve(b, r0, n_max=100):
    """Lithium lost by the end of cycles 1..n_max when R_Q grows by exactly r0 per cycle."""
    tab = run.rq_table(b, 0.01, n=4000)     # fine, so the curve is not the predictor's own grid
    return [run.D.l_of_r(tab, r0 * n) for n in range(1, n_max + 1)]


class Kinetic(unittest.TestCase):
    def test_line_fit(self):
        a, s = run.line_fit([1, 2, 3, 4], [3, 5, 7, 9])
        self.assertAlmostEqual(a, 1.0)
        self.assertAlmostEqual(s, 2.0)

    def test_capacity_falls_with_lost_lithium(self):
        b = linear_cell()
        self.assertGreater(run.cap(b["n_li"], b), run.cap(b["n_li"] - 0.01, b))

    def test_rq_weight_at_least_one(self):
        # the OCP rises and the capacity falls with loss, so R_Q grows at least as fast as L
        b = linear_cell()
        ls, rs = run.rq_table(b, 0.02)
        self.assertEqual(rs[0], 0.0)
        for i in range(1, len(ls)):
            self.assertGreaterEqual(rs[i] - rs[i - 1], (ls[i] - ls[i - 1]) * (1 - 1e-9))

    def test_recovers_its_own_law(self):
        b = linear_cell()
        lost = kinetic_curve(b, 2e-5)
        self.assertLess(abs(math.log(run.kinetic_loss(lost, b) / lost[98])), 0.01)

    def test_decelerates_without_a_fitted_curvature(self):
        # a curve that obeys the kinetic law slows down; the law reads it from ten cycles, where a straight line in L over-predicts
        b = linear_cell()
        lost = kinetic_curve(b, 2e-5)
        self.assertLess(lost[98] - lost[97], lost[1] - lost[0])
        a, s = run.line_fit(list(range(2, 11)), lost[1:10])
        self.assertGreater(a + 99 * s, lost[98])

    def test_no_loss_no_prediction(self):
        self.assertIsNone(run.kinetic_loss([0.0] * 100, linear_cell()))

    def test_verdicts(self):
        c = lambda **k: dict(lerr_rp=0.09, lerr_q=0.03, rhoL_q=0.97) | k
        V = run.verdicts({"Ai2020@0.65x": c(), "NCA_Kim2011@0.5x": c(lerr_rp=0.05, lerr_q=0.02),
                          "Chen2020@1.25x": c(lerr_rp=0.35, lerr_q=0.28), "OKane2022@1.25x": c(lerr_rp=0.35, lerr_q=0.25)})
        for h in ("H147", "H148", "H149", "H150", "H151"):
            self.assertEqual(V[h], "supported", h)
        V = run.verdicts({"Ai2020@0.65x": c(lerr_q=0.2), "NCA_Kim2011@0.5x": c(lerr_q=0.12),
                          "Chen2020@1.25x": c(lerr_rp=0.2, lerr_q=0.4), "OKane2022@1.25x": c(lerr_rp=0.2, lerr_q=0.4)})
        for h in ("H147", "H148", "H149", "H150"):
            self.assertEqual(V[h], "refuted", h)


if __name__ == "__main__":
    unittest.main()
