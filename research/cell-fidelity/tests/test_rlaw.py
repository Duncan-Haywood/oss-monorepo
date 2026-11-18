import importlib.util
import math
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parents[1] / "experiments" / "rlaw"
spec = importlib.util.spec_from_file_location("rlaw_run", HERE / "run.py")
run = importlib.util.module_from_spec(spec)
spec.loader.exec_module(run)

G = [1e-4 + k * (1 - 2e-4) / 400 for k in range(401)]


def linear_cell(qn=0.1, qp=0.1, n_li=0.09):
    return dict(g=G, Un=[0.5 - 0.5 * x for x in G], Up=[4.5 - y for y in G], Qn=qn, Qp=qp, n_li=n_li, vlo=3.0, vhi=4.1)


class RLaw(unittest.TestCase):
    def test_power_law_on_r_recovers_a_sqrt_shaped_feedback_free_loss(self):
        # R(n) = a sqrt(n) (no feedback), L = ln(1 + kc R) / kc: the power law on R needs no law choice to get L(99)
        b = linear_cell()
        kc = run.D.KAPPA * 0.5 / (b["Qn"] + 0.5 * b["Qp"])
        lost = [math.log(1 + kc * 2e-4 * n ** 0.5) / kc for n in range(1, 101)]
        self.assertAlmostEqual(run.rlaw_loss(lost, b) / lost[98], 1.0, delta=0.01)

    def test_law_is_fixed_to_power(self):
        self.assertEqual(run.R_LAW, "power")
        b = linear_cell()
        lost = [3e-4 * n ** 0.7 for n in range(1, 101)]
        self.assertEqual(run.rlaw_loss(lost, b), run.D.derived_loss(lost, b, "power"))

    def test_median_log_errors(self):
        rows = [dict(l_true=1.0, p=math.e), dict(l_true=1.0, p=1 / math.e ** 2), dict(l_true=2.0, p=2.0)]
        self.assertAlmostEqual(run.med_abs_log(rows, "p"), 1.0)
        self.assertAlmostEqual(run.med_signed_log(rows, "p"), 0.0)

    def test_verdicts(self):
        c = lambda **k: dict(lerr_rp=0.05, lerr_law=0.2, lerr_der=0.3, rho_rp=0.9, rho_sqrt=0.6, rho_one=0.9) | k
        V = run.verdicts({"Ai2020@0.55x": c(rho_one=0.99), "NCA_Kim2011@0.75x": c(lerr_der=0.05), "NCA_Kim2011@1x": c(lerr_der=0.04)})
        self.assertEqual((V["H135"], V["H136"], V["H137"], V["H138"]), ("supported",) * 4)
        V = run.verdicts({"Ai2020@0.55x": c(lerr_rp=0.4, lerr_der=0.1), "NCA_Kim2011@0.75x": c(), "NCA_Kim2011@1x": c()})
        self.assertEqual((V["H136"], V["H138"]), ("refuted", "refuted"))


if __name__ == "__main__":
    unittest.main()
