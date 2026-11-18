import importlib.util
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parents[1] / "experiments" / "loaded"
spec = importlib.util.spec_from_file_location("loaded_run", HERE / "run.py")
run = importlib.util.module_from_spec(spec)
spec.loader.exec_module(run)

G = [1e-4 + k * (1 - 2e-4) / 400 for k in range(401)]


def linear_cell():
    return dict(g=G, Un=[0.5 - 0.5 * x for x in G], Up=[4.5 - y for y in G], Qn=0.1, Qp=0.1, n_li=0.09, vlo=3.0, vhi=4.1)


class Loaded(unittest.TestCase):
    def test_zero_eta_is_open_circuit(self):
        b = linear_cell()
        self.assertAlmostEqual(run.cap_eta(b["n_li"], b, 0.0), run.KN.cap(b["n_li"], b))

    def test_capacity_falls_with_eta(self):
        b = linear_cell()
        qs = [run.cap_eta(b["n_li"], b, e) for e in (0.0, 0.05, 0.1, 0.2)]
        self.assertTrue(all(a > c for a, c in zip(qs, qs[1:])))
        self.assertEqual(run.cap_eta(b["n_li"], b, 0.6), 0.0)

    def test_solve_eta_inverts(self):
        b = linear_cell()
        q = run.cap_eta(b["n_li"], b, 0.123)
        self.assertAlmostEqual(run.solve_eta(b["n_li"], b, q), 0.123, places=5)
        self.assertEqual(run.solve_eta(b["n_li"], b, 10.0), 0.0)

    def test_eta_of_recovers_constant_eta(self):
        b = linear_cell()
        lost = [1e-4 * n for n in range(1, 11)]
        q_ch = [run.cap_eta(b["n_li"] - l, b, 0.08) for l in lost]
        self.assertAlmostEqual(run.eta_of(q_ch, lost, b), 0.08, places=5)

    def test_zero_eta_reduces_to_5zb(self):
        b = linear_cell()
        lost = [2e-4 * n ** 0.8 for n in range(1, 101)]
        self.assertAlmostEqual(run.loaded_loss(lost, b, 0.0), run.KN.kinetic_loss(lost, b), places=12)

    def test_recovers_a_loaded_kinetic_curve(self):
        # a curve whose loaded R grows by exactly r0 per cycle is extrapolated to cycle 99 within the grid error,
        # and 5zb's open-circuit law (eta = 0) misses it
        b = linear_cell()
        eta = 0.15
        tab = run.rq_table(b, 0.02, eta, n=4000)
        lost = [run.D.l_of_r(tab, 1e-4 * n) for n in range(1, 101)]
        self.assertAlmostEqual(run.loaded_loss(lost, b, eta) / lost[98], 1.0, places=2)
        self.assertGreater(abs(run.loaded_loss(lost, b, 0.0) / lost[98] - 1), 0.005)


if __name__ == "__main__":
    unittest.main()
