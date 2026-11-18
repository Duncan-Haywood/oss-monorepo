import importlib.util
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parents[1] / "experiments" / "consistent"
spec = importlib.util.spec_from_file_location("consistent_run", HERE / "run.py")
run = importlib.util.module_from_spec(spec)
spec.loader.exec_module(run)

G = [1e-4 + k * (1 - 2e-4) / 400 for k in range(401)]


def linear_cell():
    return dict(g=G, Un=[0.5 - 0.5 * x for x in G], Up=[4.5 - y for y in G], Qn=0.1, Qp=0.1, n_li=0.09, vlo=3.0, vhi=4.1)


def curved_cell():
    # a convex negative OCP, so the potential rise depends on where in the window it is read
    return dict(linear_cell(), Un=[0.6 * (1 - x) ** 3 + 0.05 for x in G])


class Consistent(unittest.TestCase):
    def test_zero_eta_is_open_circuit_du(self):
        b = curved_cell()
        for l in (0.0, 0.002, 0.01):
            self.assertAlmostEqual(run.du_eta(l, b, 0.0), run.SF.du_surf(l, b, 0.0), places=12)

    def test_du_starts_at_zero_and_rises_with_loss(self):
        b = curved_cell()
        for eta in (0.0, 0.1, 0.3):
            self.assertAlmostEqual(run.du_eta(0.0, b, eta), 0.0, places=12)
            rs = [run.du_eta(l, b, eta) for l in (0.002, 0.006, 0.012)]
            self.assertTrue(all(a < c for a, c in zip(rs, rs[1:])))

    def test_shortened_window_tops_lower(self):
        b = curved_cell()
        self.assertLess(run.x_hi(b["n_li"], b, 0.2), run.x_hi(b["n_li"], b, 0.0))

    def test_convex_ocp_rises_faster_in_shortened_window(self):
        b = curved_cell()
        self.assertGreater(run.du_eta(0.01, b, 0.3), run.du_eta(0.01, b, 0.0))

    def test_oc_lever_reduces_to_5zc(self):
        b = linear_cell()
        lost = [2e-4 * n ** 0.8 for n in range(1, 101)]
        eta = 0.1
        got = run.law_loss(lost, b, eta, lambda l: run.du_eta(l, b, 0.0))
        self.assertAlmostEqual(got / run.LD.loaded_loss(lost, b, eta), 1.0, places=3)

    def test_recovers_a_consistent_kinetic_curve(self):
        # a curve whose eta-consistent R grows by exactly r0 per cycle is extrapolated to cycle 99 within grid error
        b = curved_cell()
        eta = 0.15
        du = lambda l: run.du_eta(l, b, eta)
        tab = run.r_table(b, 0.02, eta, du, n=2000)
        lost = [run.D.l_of_r(tab, 1e-4 * n) for n in range(1, 101)]
        self.assertAlmostEqual(run.law_loss(lost, b, eta, du) / lost[98], 1.0, places=2)


if __name__ == "__main__":
    unittest.main()
