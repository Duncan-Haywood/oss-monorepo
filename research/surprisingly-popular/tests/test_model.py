import random, unittest
from surprisingly_popular import *
from surprisingly_popular.model import simulate


class T(unittest.TestCase):
    def test_threshold_identity(self):
        # brute-force SP from individual reports equals the fraction-threshold rule
        rng = random.Random(1)
        for _ in range(300):
            pi, s, sp = rng.uniform(.05, .95), rng.uniform(.3, .95), rng.uniform(.6, .99)
            if s + sp <= 1.05:
                continue
            n = rng.randint(3, 40)
            sig = [rng.random() < rng.uniform(.1, .9) for _ in range(n)]
            u, v = cond_flag(pi, s, sp)
            preds = [u if x else v for x in sig]
            th = sp_threshold(pi, s, sp)
            frac = sum(sig) / n
            if abs(frac - th) > 1e-9:
                self.assertEqual(sp_decide(sig, preds), frac > th)

    def test_limit_correct_under_common_prior(self):
        rng = random.Random(2)
        for _ in range(20000):
            pi, s, sp = rng.uniform(.01, .99), rng.uniform(.01, .99), rng.uniform(.01, .99)
            if s + sp > 1.001:
                self.assertTrue(sp_correct_in_limit(pi, s, sp))

    def test_majority_fails_rare_diagnostic(self):
        # detection 0.45 < 1/2: majority errs with probability -> 1 in the faulty state, SP -> 0
        pi, s, sp = .5, .45, .95
        eA_m = error_at_threshold(301, .5, s, sp, "A")
        eA_s = error_at_threshold(301, sp_threshold(pi, s, sp), s, sp, "A")
        self.assertGreater(eA_m, .95)
        self.assertLess(eA_s, 1e-9)

    def test_bayes_no_worse_than_sp(self):
        pi, s, sp = .5, .45, .95
        for n in (11, 21, 51, 101):
            _, _, e_sp = decide_error(n, sp_threshold(pi, s, sp), pi, s, sp)
            eA, eB = bayes_error(n, pi, s, sp)
            self.assertLessEqual(pi * eA + (1 - pi) * eB, e_sp + 1e-15)

    def test_exact_matches_simulation(self):
        pi, s, sp, n = .5, .45, .95, 15
        rng = random.Random(3)
        m = 20000
        wrong = sum(not simulate(n, pi, s, sp, "A", rng) for _ in range(m)) / m
        self.assertAlmostEqual(wrong, error_at_threshold(n, sp_threshold(pi, s, sp), s, sp, "A"), delta=.01)

    def test_misspecification(self):
        s, sp = .45, .95
        # a wrong believed *prior* never breaks the limit (theta stays inside (1-spec, sens)) ...
        for pb in (.001, .3, .99, .999):
            self.assertTrue(sp_correct_in_limit(.5, s, sp, believed=(pb, s, sp)))
        # ... but it wrecks finite-n accuracy ...
        th = sp_threshold(.99, s, sp)
        self.assertGreater(error_at_threshold(101, th, s, sp, "A"), .4)
        # ... and believing the detector is much better than it is breaks the limit
        self.assertFalse(sp_correct_in_limit(.5, s, sp, believed=(.5, .9, .5)))

    def test_byzantine_breakdown(self):
        pi, s, sp = .5, .45, .95
        rb = byzantine_breakdown(pi, s, sp)
        rng = random.Random(4)
        n, m = 2000, 60
        lo = sum(simulate(n, pi, s, sp, "A", rng, rho=rb * .8) for _ in range(m)) / m
        hi = sum(simulate(n, pi, s, sp, "A", rng, rho=min(1, rb * 1.25)) for _ in range(m)) / m
        self.assertGreater(lo, .95)
        self.assertLess(hi, .05)


if __name__ == "__main__":
    unittest.main()
