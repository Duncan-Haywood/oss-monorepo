import importlib.util
import math
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parents[1] / "experiments" / "surface"
spec = importlib.util.spec_from_file_location("surface_run", HERE / "run.py")
run = importlib.util.module_from_spec(spec)
spec.loader.exec_module(run)

G = [1e-4 + k * (1 - 2e-4) / 400 for k in range(401)]


def linear_cell(qn=0.1, qp=0.1, n_li=0.09):
    return dict(g=G, Un=[0.5 - 0.5 * x for x in G], Up=[4.5 - y for y in G], Qn=qn, Qp=qp, n_li=n_li, vlo=3.0, vhi=4.1)


def plateau_cell(edge):
    """Negative OCP flat (0.1 V) above stoichiometry `edge`, rising steeply (1 V per unit) below it."""
    un = [0.1 + max(0.0, edge - x) for x in G]
    return dict(g=G, Un=un, Up=[4.5 - y for y in G], Qn=0.1, Qp=0.1, n_li=0.09, vlo=3.0, vhi=4.1)


class Surface(unittest.TestCase):
    def test_zero_offset_is_5y(self):
        b = linear_cell()
        lost = [3e-4 * n ** 0.7 for n in range(1, 101)]
        self.assertAlmostEqual(run.surface_loss(lost, b, 0.0), run.RL.rlaw_loss(lost, b), places=12)

    def test_linear_ocp_offset_does_not_matter(self):
        # on a linear OCP the rise does not depend on where it is read
        b = linear_cell()
        for l in (0.0, 0.003, 0.02):
            self.assertAlmostEqual(run.du_surf(l, b, -0.05), run.du_surf(l, b, 0.0), places=9)

    def test_offset_reads_off_the_plateau(self):
        # bulk x1 on the plateau: no rise at open circuit; shifted to the plateau edge, the rise appears
        b = plateau_cell(edge=0.3)
        x1 = run.B.window(b["n_li"], b)[1]
        self.assertGreater(x1, 0.35)
        l = 0.01
        self.assertAlmostEqual(run.du_surf(l, b, 0.0), 0.0, places=9)
        self.assertGreater(run.du_surf(l, b, 0.3 - x1), 0.05)

    def test_offset_mean_of_cycles_2_to_10(self):
        b = linear_cell()
        lost = [1e-4 * n for n in range(1, 101)]
        xs = [run.B.window(b["n_li"] - l, b)[1] - 0.02 for l in lost]
        self.assertAlmostEqual(run.offset(xs, lost, b), -0.02, places=9)

    def test_feedback_lowers_the_prediction(self):
        b = plateau_cell(edge=0.3)
        x1 = run.B.window(b["n_li"], b)[1]
        lost = [5e-4 * n ** 0.8 for n in range(1, 101)]
        self.assertLess(run.surface_loss(lost, b, 0.3 - x1 + 0.005), run.surface_loss(lost, b, 0.0))

    def test_verdicts(self):
        c = lambda **k: dict(lerr_rp=0.34, lerr_s=0.12, rhoL_s=0.95) | k
        V = run.verdicts({"Chen2020@1.5x": c(), "OKane2022@1.5x": c(),
                          "NCA_Kim2011@0.875x": c(lerr_rp=0.02, lerr_s=0.06), "Ai2020@0.45x": c(lerr_rp=0.08, lerr_s=0.2)})
        self.assertEqual((V["H143"], V["H144"], V["H145"], V["H146"]), ("supported",) * 4)
        V = run.verdicts({"Chen2020@1.5x": c(lerr_s=0.4), "OKane2022@1.5x": c(lerr_s=0.5, rhoL_s=0.7),
                          "NCA_Kim2011@0.875x": c(lerr_rp=0.02, lerr_s=0.01), "Ai2020@0.45x": c(lerr_rp=0.08, lerr_s=0.2)})
        self.assertEqual((V["H143"], V["H144"], V["H145"], V["H146"]), ("refuted",) * 4)


if __name__ == "__main__":
    unittest.main()
