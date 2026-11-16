import importlib.util
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parents[1] / "experiments" / "asym"
spec = importlib.util.spec_from_file_location("asym_run", HERE / "run.py")
run = importlib.util.module_from_spec(spec)
spec.loader.exec_module(run)

G = [1e-4 + k * (1 - 2e-4) / 400 for k in range(401)]


def cell():
    # a convex negative OCP and a linear positive one, so the window's place matters
    return dict(g=G, Un=[0.6 * (1 - x) ** 3 + 0.05 for x in G], Up=[4.5 - y for y in G], Qn=0.1, Qp=0.1, n_li=0.09,
                vlo=3.0, vhi=4.1)


class Asym(unittest.TestCase):
    def test_symmetric_window_is_5zc_capacity(self):
        b = cell()
        for eta in (0.0, 0.05, 0.2):
            self.assertAlmostEqual(run.cap2(b["n_li"], b, eta, eta), run.LD.cap_eta(b["n_li"], b, eta), places=12)

    def test_solve_ec_hits_the_capacity(self):
        b = cell()
        q = 0.7 * run.cap2(b["n_li"], b, 0.05, 0.0)
        ec = run.solve_ec(b["n_li"], b, 0.05, q)
        self.assertAlmostEqual(run.cap2(b["n_li"], b, 0.05, ec) / q, 1.0, places=5)

    def test_solve_asym_recovers_a_known_split(self):
        b = cell()
        ed, ec = 0.06, 0.18
        q = run.cap2(b["n_li"], b, ed, ec)
        vb = run.vbar2(b["n_li"], b, ed, ec)
        got = run.solve_asym(b["n_li"], b["n_li"], b, q, vb)
        self.assertAlmostEqual(got[0], ed, places=4)
        self.assertAlmostEqual(got[1], ec, places=4)

    def test_symmetric_law_is_5zd(self):
        b = cell()
        lost = [2e-4 * n ** 0.8 for n in range(1, 101)]
        eta = 0.12
        du = lambda l: run.CN.du_eta(l, b, eta)
        got = run.law(lost, b, eta, eta, du)
        self.assertAlmostEqual(got / run.CN.law_loss(lost, b, eta, du), 1.0, places=6)

    def test_constant_drift_is_5zd(self):
        b = cell()
        lost = [2e-4 * n ** 0.8 for n in range(1, 101)]
        eta = 0.12
        got = run.law_drift(lost, b, lambda l: eta)
        self.assertAlmostEqual(got / run.CN.law_loss(lost, b, eta, lambda l: run.CN.du_eta(l, b, eta)), 1.0, places=6)


if __name__ == "__main__":
    unittest.main()
