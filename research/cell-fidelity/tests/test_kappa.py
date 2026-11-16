import importlib.util
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parents[1] / "experiments" / "kappa"
spec = importlib.util.spec_from_file_location("kappa_run", HERE / "run.py")
run = importlib.util.module_from_spec(spec)
spec.loader.exec_module(run)

G = [1e-4 + k * (1 - 2e-4) / 400 for k in range(401)]


def cell():
    # a convex negative OCP and a linear positive one (as test_asym), so the lever rises with the lost lithium
    return dict(g=G, Un=[0.6 * (1 - x) ** 3 + 0.05 for x in G], Up=[4.5 - y for y in G], Qn=0.1, Qp=0.1, n_li=0.09,
                vlo=3.0, vhi=4.1)


def synth(b, eta, kappa, s=2e-4, n=100):
    """A loss history whose R_kappa is exactly a line in the cycle number (the law holds with this kappa)."""
    ls, rs = run.r_of(run.tab([s * m for m in range(1, n + 1)], b, eta, n=4000, span=8.0), kappa)
    return [run.D.l_of_r((ls, rs), s * m) for m in range(1, n + 1)]


class Kappa(unittest.TestCase):
    def test_fixed_kappa_is_5zd(self):
        b, eta = cell(), 0.12
        lost = [2e-4 * m ** 0.8 for m in range(1, 101)]
        t = run.tab(lost, b, eta)
        want = run.CN.law_loss(lost, b, eta, lambda l: run.CN.du_eta(l, b, eta))
        self.assertAlmostEqual(run.forecast(t, lost, run.KAPPA) / want, 1.0, places=9)

    def test_fit_recovers_a_known_kappa(self):
        b, eta = cell(), 0.12
        for k0 in (15.0, 40.0):
            lost = synth(b, eta, k0)
            got = run.kappa_fit(run.fine(lost, b, eta), lost)
            self.assertLess(abs(got - k0), 0.5, (k0, got))

    def test_slope_recovers_a_known_kappa(self):
        b, eta = cell(), 0.12
        lost = synth(b, eta, 40.0)
        got = run.kappa_slope(run.fine(lost, b, eta), lost)
        self.assertLess(abs(got - 40.0), 2.0, got)

    def test_oracle_makes_the_forecast_exact(self):
        b, eta = cell(), 0.12
        lost = [2e-4 * m ** 0.8 for m in range(1, 101)]
        t = run.tab(lost, b, eta)
        lt = 1.1 * run.forecast(t, lost, run.KAPPA)
        ks = run.kappa_oracle(t, lost, lt)
        self.assertLess(ks, run.KAPPA)
        self.assertAlmostEqual(run.forecast(t, lost, ks) / lt, 1.0, places=6)


if __name__ == "__main__":
    unittest.main()
