import math
import unittest
from decision_regret_transfer import *


def kl(u, t):
    return log_D(t + u, t)


class T(unittest.TestCase):
    def test_binary_closed_forms(self):
        A, R = 0.9, 0.1  # tau = 0.1, K = A+R = 1
        C = Costs(A, R)
        tau = 0.1
        for eps in (0.02, 0.05, 0.3):
            self.assertAlmostEqual(delta(C, "brier", eps), eps ** 2, places=9)
            want = min(log_D(tau + eps, tau), log_D(tau - eps, tau) if tau - eps > 0 else math.inf)
            self.assertAlmostEqual(delta(C, "log", eps), want, places=9)

    def test_matches_bruteforce(self):
        for C in (Costs(0.9, 0.1), Costs(1.0, 1.0, c=0.2)):
            for rule in RULES:
                for eps in (0.1, 0.2):
                    ex, bf = delta(C, rule, eps), delta_bruteforce(C, rule, eps, n=600)
                    self.assertGreaterEqual(bf, ex - 1e-9)      # grid can only overestimate the minimum
                    self.assertLess(bf, ex * 1.05 + 1e-4)

    def test_audit_regions(self):
        C = Costs(1.0, 1.0, c=0.2)
        self.assertEqual(C.regions["accept"], (0.0, 0.2))
        self.assertAlmostEqual(C.regions["reject"][0], 0.8)
        self.assertEqual(C.action(0.5), "audit")
        self.assertEqual(Costs(1.0, 1.0, c=0.6).c, None)  # audit never optimal

    def test_hinge_is_linear(self):
        for tau in (0.5, 0.1, 0.02):
            worst = min(hinge_regret(tau, e / 500, f / 50) / abs(e / 500 - tau)
                        for e in range(501) for f in range(-50, 51)
                        if e / 500 != tau and (f < 0) == (e / 500 > tau) and f != 0)
            self.assertGreaterEqual(worst, 1.0 - 1e-9)   # excess risk >= decision regret; ratio is 1+|f|, so 1 is an infimum only
            self.assertLess(worst, 1.0 + 0.05)

    def test_bound_holds_and_is_tight(self):
        C = Costs(1.0, 1.0, c=0.2)
        for rule in RULES:
            h = envelope(C, rule, m=200)
            for sigma in (0.3, 1.0, 2.0):
                S, Rg = simulate(C, rule, 2, 5, 1.0, 0.0, sigma, n=20000, seed=1)
                self.assertLessEqual(Rg, regret_bound(h, S) + 1e-6)

    def test_envelope_is_convex_and_below_delta(self):
        # psi <= delta is what makes psi^{-1}(E[D]) a valid cap: equivalently regret_bound(h, delta(eps)) >= eps.
        C = Costs(1.0, 1.0, c=0.2)
        h = envelope(C, "log", m=100)
        slopes = [(y1 - y0) / (x1 - x0) for (x0, y0), (x1, y1) in zip(h, h[1:])]
        self.assertTrue(all(s2 >= s1 - 1e-12 for s1, s2 in zip(slopes, slopes[1:])))
        for eps in (0.0013, 0.013, 0.13, 0.41, 0.97):
            self.assertGreaterEqual(regret_bound(h, delta(C, "log", eps)), eps - 1e-12)

    def test_bound_monotone(self):
        h = envelope(Costs(0.98, 0.02), "log")
        v = [regret_bound(h, s) for s in (0.001, 0.01, 0.1, 1.0)]
        self.assertEqual(v, sorted(v))

    def test_certificate_covers_every_tight_pair(self):
        # A point-mass verifier on the tight pair for eps has excess score delta(eps) and regret eps; the cap must cover it.
        # The pre-fix hull of grid samples failed this at 10,115 of 12,396 pairs (quality census 2026-11-15).
        for C in (Costs(1, 1, c=0.2), Costs(0.9, 0.1), Costs(3, 1, c=0.3), Costs(0.5, 2, c=0.2)):
            top = C.max_regret()
            for rule in RULES:
                h = envelope(C, rule, m=100)
                for e in [top * 10 ** (-k / 2) for k in range(0, 11)] + [top * j / 37 for j in range(1, 37)]:
                    b = regret_bound(h, delta(C, rule, e))
                    self.assertGreaterEqual(b, e - 1e-12, (C.A, C.R, C.c, rule, e))
                    self.assertLessEqual(b, max(e / 0.9, e + top / 100) + 1e-12)   # slack: one grid step

    def test_certificate_covers_a_tight_pair(self):
        C = Costs(1, 1, c=0.2)
        h = envelope(C, "brier")
        self.assertGreaterEqual(regret_bound(h, delta(C, "brier", 0.001)), 0.001 - 1e-12)
        C = Costs(0.9, 0.1)   # E6: eta = 0.15, q = tau = 0.1, regret 0.05
        b = regret_bound(envelope(C, "log"), log_D(0.15, 0.1))
        self.assertTrue(0.05 <= b <= 0.05 / 0.9, b)

    def test_asymmetric_audit_regions_and_max_regret(self):
        C = Costs(3.0, 1.0, c=0.3)   # accept below c/A = 0.1, reject above 1 - c/R = 0.7
        self.assertAlmostEqual(C.regions["accept"][1], 0.1)
        self.assertAlmostEqual(C.regions["reject"][0], 0.7)
        self.assertEqual(C.action(0.69), "audit")
        self.assertEqual(C.action(0.71), "reject")
        self.assertEqual(C.action(1.2), "reject")   # out-of-range reports are clipped, not None
        self.assertEqual(Costs(3.0, 1.0, c=0.6).c, 0.6)   # audit optimal below AR/(A+R) = 0.75
        self.assertIsNone(Costs(3.0, 1.0, c=0.76).c)
        self.assertAlmostEqual(Costs(0.9, 0.1).max_regret(), 0.9)
        self.assertAlmostEqual(Costs(3.0, 1.0, c=0.3).max_regret(), 3.0)   # accept at eta = 1

    def test_flat_segment_inverse_takes_largest_eps(self):
        self.assertAlmostEqual(regret_bound([(0.0, 0.0), (0.1, 0.0), (0.2, 1.0)], 0.0), 0.1)
        self.assertAlmostEqual(regret_bound([(0.0, 0.0), (0.1, 0.0), (0.2, 1.0)], 0.5), 0.15)

    def test_results_headline_reproduces(self):
        # E2, A/R = 1: the committed results.txt must match the code.
        import os
        txt = open(os.path.join(os.path.dirname(__file__), "..", "experiments", "results.txt")).read()
        got = f"log bound={regret_bound(envelope(Costs(0.5, 0.5), 'log'), 0.01):.4f}"
        self.assertIn("A/R=  1 tau=0.5000: " + got, txt)


if __name__ == "__main__":
    unittest.main()
