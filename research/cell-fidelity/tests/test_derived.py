import importlib.util
import math
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parents[1] / "experiments" / "derived"
spec = importlib.util.spec_from_file_location("derived_run", HERE / "run.py")
run = importlib.util.module_from_spec(spec)
spec.loader.exec_module(run)

G = [1e-4 + k * (1 - 2e-4) / 400 for k in range(401)]


def linear_cell(qn=0.1, qp=0.1, n_li=0.09):
    # U_n = 0.5 - 0.5 x, U_p = 4.5 - y: at a fixed upper cut-off dU_n = 0.5 L / (Qn + 0.5 Qp), linear in L
    return dict(g=G, Un=[0.5 - 0.5 * x for x in G], Up=[4.5 - y for y in G], Qn=qn, Qp=qp, n_li=n_li, vlo=3.0, vhi=4.1)


class Derived(unittest.TestCase):
    def test_kappa_is_alpha_f_over_rt(self):
        self.assertAlmostEqual(run.KAPPA, 0.65 * 96485.33212 / (8.314462618 * 298.15), places=9)
        self.assertTrue(25.2 < run.KAPPA < 25.4)

    def test_du_top_is_linear_on_linear_ocps(self):
        b = linear_cell()
        c = 0.5 / (b["Qn"] + 0.5 * b["Qp"])
        for l in (0.0, 0.001, 0.004):
            self.assertAlmostEqual(run.du_top(l, b), c * l, places=6)

    def test_r_table_and_inverse_match_the_closed_form(self):
        b = linear_cell()
        kc = run.KAPPA * 0.5 / (b["Qn"] + 0.5 * b["Qp"])
        tab = run.r_table(b, 0.006, n=400)
        for l in (0.001, 0.003, 0.006):
            r = (math.exp(kc * l) - 1) / kc
            self.assertAlmostEqual(run.B.interp(*tab, l), r, delta=1e-4 * r)
            self.assertAlmostEqual(run.l_of_r(tab, r), l, delta=1e-5)

    def test_derived_loss_recovers_a_self_limited_power_law(self):
        # R(n) = a n^b exactly; the true loss is L = ln(1 + kc R) / kc; the derived predictor should return L(99)
        b = linear_cell()
        kc = run.KAPPA * 0.5 / (b["Qn"] + 0.5 * b["Qp"])
        a, e = 2e-4, 0.5
        lost = [math.log(1 + kc * a * n ** e) / kc for n in range(1, 101)]
        got = run.derived_loss(lost, b, "power")
        self.assertAlmostEqual(got / lost[98], 1.0, delta=0.01)

    def test_no_feedback_leaves_the_law_unchanged(self):
        b = linear_cell()
        lost = [2e-4 * n ** 0.5 for n in range(1, 101)]
        self.assertAlmostEqual(run.derived_loss(lost, b, "power", kappa=0.0) / run.FL.law_l(lost, "power", 99), 1.0, delta=1e-3)


if __name__ == "__main__":
    unittest.main()
