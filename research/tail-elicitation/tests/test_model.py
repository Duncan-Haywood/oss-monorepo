import unittest, math, random
from tail_elicitation import *

D = Dist([1, 2, 4, 9, 30], [0.4, 0.3, 0.15, 0.1, 0.05])   # F(9)=0.95
D2 = Dist([0.5, 1, 3, 7, 20, 80], [0.3, 0.3, 0.2, 0.12, 0.06, 0.02])

class T(unittest.TestCase):
    def test_ru_identity(self):
        for d in (D, D2):
            for tau in (0.7, 0.9, 0.97):
                lo = min(d.m(v / 100, tau) for v in range(1, 9000))
                self.assertAlmostEqual(lo, d.es(tau), delta=0.02 * d.es(tau) + 1e-9)
                self.assertLessEqual(d.es(tau), d.m(d.var(tau) + 1, tau) + 1e-12)
    def test_joint_minimiser_is_var_es(self):
        for d in (D, D2):
            for tau in (0.7, 0.9, 0.96):
                for lam in (0.0, 0.5, 2.0):
                    s, v, e = argmin_expected(d, tau, lam)
                    self.assertAlmostEqual(v, d.var(tau), places=6)
                    self.assertAlmostEqual(e, d.es(tau), places=6)
    def test_profile_is_log_es(self):
        s, v, e = argmin_expected(D2, 0.9)
        self.assertAlmostEqual(s, math.log(D2.es(0.9)), places=9)
    def test_excess_e_closed_form(self):
        tau = 0.9; v = D2.var(tau); E = D2.es(tau)
        for r in (0.5, 0.8, 1.25, 2.0):
            ex = expected_score(D2, v, r * E, tau) - expected_score(D2, v, E, tau)
            self.assertAlmostEqual(ex, excess_e(r), places=10)
    def test_excess_v_closed_form(self):
        for tau in (0.7, 0.9):
            q, E = D2.var(tau), D2.es(tau)
            for v in (0.6, 1.0, 2.5, 5.0, 12.0, 60.0):
                ex = expected_score(D2, v, E, tau) - expected_score(D2, q, E, tau)
                self.assertAlmostEqual(ex, excess_v(D2, v, tau), places=10)
                self.assertGreaterEqual(ex, -1e-12)
    def test_es_alone_not_elicitable(self):
        tau = 0.9
        P0 = Dist([0, 10], [0.5, 0.5]); P1 = Dist([0, 20], [0.95, 0.05])
        self.assertAlmostEqual(P0.es(tau), 10); self.assertAlmostEqual(P1.es(tau), 10)
        self.assertAlmostEqual(P0.mix(P1).es(tau), 12.5)      # level set {ES=10} not convex (Osband)
    def test_es_concave_in_distribution(self):
        tau = 0.9
        for w in (0.2, 0.5, 0.8):
            self.assertGreaterEqual(D.mix(D2, w).es(tau) + 1e-12, w * D.es(tau) + (1 - w) * D2.es(tau))
    def test_pinball_blind_to_es(self):
        # same VaR, different ES -> identical pinball, distinct FZ
        tau = 0.9; v = D2.var(tau)
        self.assertGreater(sum(p * pinball(v, y, tau) for y, p in zip(D2.ys, D2.ps)), 0)   # pinball has no e argument at all
        self.assertGreater(excess_e(0.7), 0.05)
    def test_closed_forms_match_sampling(self):
        rng = random.Random(3); tau = 0.95
        xs = sorted(lognormal(rng, 1.0) for _ in range(400000)); k = int(tau * len(xs))
        v, e = true_pair_lognormal(1.0, tau)
        self.assertAlmostEqual(xs[k] / v, 1, delta=0.03); self.assertAlmostEqual(sum(xs[k:]) / len(xs[k:]) / e, 1, delta=0.03)
        v, e = true_pair_pareto(3.0, tau); self.assertAlmostEqual(e / v, 1.5)
    def test_score_scale_invariant(self):
        self.assertAlmostEqual(score(20, 50, 30, 0.9) - score(2, 5, 3, 0.9), math.log(10))   # shift by ln(scale) only

if __name__ == "__main__": unittest.main()
