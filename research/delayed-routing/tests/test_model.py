import unittest, math, random
from delayed_routing import *

class T(unittest.TestCase):
    def test_outstanding_zero_delay(self):
        self.assertEqual(outstanding([0] * 6), [0] * 6)
    def test_outstanding_constant(self):
        # delay d: at decision t, rounds t-d..t-1 are missing
        o = outstanding([2] * 8); self.assertEqual(o, [0, 1, 2, 2, 2, 2, 2, 2])
    def test_no_delay_matches_hedge(self):
        ls = bernoulli_losses(200, 3, 0.2, 1); r = play(ls, [0] * 200, 0.3)
        # manual Hedge
        L = [0.0] * 3; alg = 0.0
        for l in ls:
            w = [math.exp(-0.3 * x) for x in L]; z = sum(w); alg += sum(wi / z * li for wi, li in zip(w, l))
            L = [a + b for a, b in zip(L, l)]
        self.assertAlmostEqual(r["alg_loss"], alg, places=9)
    def test_bound_holds_random_sequences(self):
        for seed in range(30):
            r = random.Random(seed); Tn = 150; N = r.choice([2, 3, 5])
            ls = [[r.random() for _ in range(N)] for _ in range(Tn)]
            dl = [r.choice([0, 0, 1, 3, 10, 40]) for _ in range(Tn)]
            for eta in (0.05, 0.2, 0.6, 1.5):
                out = play(ls, dl, eta); self.assertLessEqual(out["regret"], bound(N, Tn, out["D"], eta) + 1e-9)
    def test_bound_holds_against_adaptive_adversary(self):
        for d in (0, 5, 25):
            dl = [d] * 400
            for eta in (0.1, 0.4):
                out = play([[0.0, 0.0]] * 400, dl, eta, adversary=punish_leader(2))
                self.assertLessEqual(out["regret"], bound(2, 400, out["D"], eta) + 1e-9)
    def test_eta_opt_minimises_bound(self):
        N, Tn, D = 4, 1000, 3000; e = eta_opt(N, Tn, D)
        for f in (0.5, 0.8, 1.25, 2.0):
            self.assertLess(bound(N, Tn, D, e), bound(N, Tn, D, e * f))
        self.assertAlmostEqual(bound(N, Tn, D, e), 2 * math.sqrt(math.log(N) * (Tn / 8 + D / 2)), places=9)
    def test_delay_hurts_adaptive_adversary(self):
        a = play([[0, 0]] * 2000, [0] * 2000, 0.2, adversary=punish_leader(2))["regret"]
        b = play([[0, 0]] * 2000, [30] * 2000, 0.2, adversary=punish_leader(2))["regret"]
        self.assertGreater(b, 2 * a)
    def test_geometric_mean(self):
        d = geometric_delays(20000, 5.0, 3); self.assertAlmostEqual(sum(d) / len(d), 5.0, delta=0.3)
    def test_mixed_delays_fraction(self):
        d = mixed_delays(10000, 0.1, 50, 2); self.assertAlmostEqual(sum(1 for x in d if x) / 10000, 0.1, delta=0.01)
    def test_adaptive_eta_is_decreasing_and_positive(self):
        f = eta_adaptive(4); self.assertGreater(f(0, 0), f(100, 0)); self.assertGreater(f(100, 0), f(100, 500)); self.assertGreater(f(1000, 9999), 0)
    def test_liquidity(self):
        self.assertAlmostEqual(lmsr_liquidity(0.25), 4.0)
if __name__ == "__main__": unittest.main()
