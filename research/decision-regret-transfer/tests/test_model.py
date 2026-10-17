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
            self.assertGreaterEqual(worst, 1.0 - 1e-9)   # excess risk >= decision regret, with equality reachable
            self.assertLess(worst, 1.0 + 0.05)

    def test_bound_holds_and_is_tight(self):
        C = Costs(1.0, 1.0, c=0.2)
        for rule in RULES:
            h = envelope(C, rule, m=200)
            for sigma in (0.3, 1.0, 2.0):
                S, Rg = simulate(C, rule, 2, 5, 1.0, 0.0, sigma, n=20000, seed=1)
                self.assertLessEqual(Rg, regret_bound(h, S) + 1e-6)

    def test_envelope_is_convex_and_below_delta(self):
        C = Costs(1.0, 1.0, c=0.2)
        h = envelope(C, "log", m=100)
        slopes = [(y1 - y0) / (x1 - x0) for (x0, y0), (x1, y1) in zip(h, h[1:])]
        self.assertTrue(all(s2 >= s1 - 1e-12 for s1, s2 in zip(slopes, slopes[1:])))
        for eps in (0.13, 0.41):
            self.assertLessEqual(regret_bound([(0, 0)] + [(x, y) for x, y in h[1:]], delta(C, "log", eps)), eps + 1e-2)

    def test_bound_monotone(self):
        h = envelope(Costs(0.98, 0.02), "log")
        v = [regret_bound(h, s) for s in (0.001, 0.01, 0.1, 1.0)]
        self.assertEqual(v, sorted(v))


if __name__ == "__main__":
    unittest.main()
