"""Headline numbers pinned against values computed outside the model's own code path.

Added after the 2026-11-17 quality census (portfolio/quality/audits/2026-11-17-runlength-twin.json):
4 of 5 seeded bugs in sizing_ratio, coverage and riccati_gain left every earlier test green.
"""
import math, unittest
from runlength_twin import *

A, B, Q, EPS = 0.9, 1.0, 1.0, 0.05


def dare_closed_form(a, b, q, r):
    # Scalar DARE  b^2 P^2 + (r - a^2 r - q b^2) P - q r = 0, positive root (not the iteration in model.py).
    c2, c1, c0 = b * b, r - a * a * r - q * b * b, -q * r
    P = (-c1 + math.sqrt(c1 * c1 - 4 * c2 * c0)) / (2 * c2)
    return a * b * P / (r + b * b * P)


class Pinned(unittest.TestCase):
    def test_riccati_matches_closed_form(self):
        for m, r in ((2.0, 0.1), (0.5, 5.0), (1.5, 5.0), (1.0, 1.0)):
            self.assertAlmostEqual(riccati_gain(m * A, B, Q, r), dare_closed_form(m * A, B, Q, r), places=9)

    def test_headline_row(self):
        # results.txt E2/E4: r=0.1, m=2 -> K 1.672, poles -0.772 / 0.128, n 3177 vs 12110, coverage 0.685
        K = riccati_gain(2.0 * A, B, Q, 0.1)
        acr, act = closed_pole(K, A, B), closed_pole(K, 2.0 * A, B)
        self.assertAlmostEqual(K, 1.672, places=3)
        self.assertAlmostEqual(acr, -0.772, places=3)
        self.assertAlmostEqual(act, 0.128, places=3)
        nt, nr = n_exact(EPS, act * act), n_exact(EPS, acr * acr)
        self.assertEqual((nt, nr), (3177, 12110))
        self.assertAlmostEqual(coverage(nt, acr * acr, act * act), 0.685, places=3)

    def test_sizing_ratio_against_iact(self):
        # Integrated autocorrelation time of x^2 for AR(1) x is (1+rho)/(1-rho) with rho = ac^2 (textbook result).
        iact = lambda rho: (1 + rho) / (1 - rho)
        for rt, rr in ((0.596, 0.016), (0.3, 0.7), (0.5, 0.5)):
            self.assertAlmostEqual(sizing_ratio(rr, rt), iact(rr) / iact(rt), places=12)

    def test_coverage_against_normal_quantile(self):
        # Interval sized for rho_nominal, true sd larger by s: coverage = 2 Phi(z/s) - 1, Phi from erf directly.
        n, rt, rn = 3177, 0.596, 0.016
        s = math.sqrt(rel_var(n, rt) / rel_var(n, rn))
        want = math.erf(1.959964 / s / math.sqrt(2))
        self.assertAlmostEqual(coverage(n, rt, rn), want, places=12)


if __name__ == "__main__":
    unittest.main()
