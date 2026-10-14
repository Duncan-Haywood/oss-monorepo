import math, random, unittest
from kelly_markets import *


def rnd(rng, n):
    return ([rng.uniform(0.2, 3) for _ in range(n)], [rng.uniform(0.05, 1) for _ in range(n)],
            [rng.uniform(0.02, 0.98) for _ in range(n)])


class T(unittest.TestCase):
    def test_wealth_conserved_heterogeneous_lambda(self):
        rng = random.Random(1)
        for _ in range(200):
            w, lam, q = rnd(rng, 6)
            for y in (0, 1):
                w2, _ = step(w, lam, q, y)
                self.assertAlmostEqual(sum(w2), sum(w), 10)

    def test_price_clears_both_securities(self):
        rng = random.Random(2)
        for _ in range(200):
            w, lam, q = rnd(rng, 5)
            for y in (0, 1):
                self.assertAlmostEqual(clearing_residual(w, lam, q, y), 0.0, 10)

    def test_full_kelly_is_exact_bayes_mixture(self):
        rng = random.Random(3)
        w0, _, q = rnd(rng, 7)
        ys = [rng.random() < 0.6 for _ in range(60)]
        ys = [int(y) for y in ys]
        r = run(w0, [1.0] * 7, q, ys)
        self.assertAlmostEqual(r["loss"], bayes_log_loss(w0, q, ys), 8)

    def test_regret_bound_random_and_adversarial(self):
        rng = random.Random(4)
        for _ in range(300):
            n = 5
            w0, lam, q = rnd(rng, n)
            ys = [rng.randint(0, 1) for _ in range(80)]
            r = run(w0, lam, q, ys)
            W = sum(w0)
            for i in range(n):
                self.assertLessEqual(r["loss"] - r["expert_loss"][i],
                                     regret_bound(w0[i] / W, lam[i]) + 1e-9)
        # adversary: always plays the outcome the market rated less likely
        w0, lam, q = [1.0] * 4, [0.3] * 4, [0.1, 0.4, 0.6, 0.9]
        w, L, Li = list(w0), 0.0, [0.0] * 4
        for _ in range(300):
            p = price(w, lam, q)
            y = 0 if p >= 0.5 else 1
            w, _ = step(w, lam, q, y)
            L -= math.log(p if y else 1 - p)
            for i in range(4):
                Li[i] -= math.log(q[i] if y else 1 - q[i])
        for i in range(4):
            self.assertLessEqual(L - Li[i], regret_bound(0.25, 0.3) + 1e-9)

    def test_optimal_lambda_matches_grid(self):
        for pi, p, q in ((0.8, 0.7, 0.95), (0.3, 0.5, 0.2), (0.6, 0.4, 0.9)):
            lam = optimal_lambda(pi, p, q)
            grid = max((growth(g / 2000, q, p, pi), g / 2000) for g in range(0, 2001))
            self.assertAlmostEqual(lam, grid[1], 3)

    def test_optimal_lambda_shades_belief_to_truth(self):
        pi, p, q = 0.8, 0.7, 0.95
        lam = optimal_lambda(pi, p, q)
        self.assertAlmostEqual(lam * q + (1 - lam) * p, pi, 12)

    def test_manipulation_cost_identity(self):
        rng = random.Random(5)
        for _ in range(100):
            V = rng.uniform(0.5, 5)
            p0 = rng.uniform(0.2, 0.8)
            q = rng.choice([0.0, 1.0]) * 0 + rng.uniform(0.02, 0.98)
            p = p0 + (q - p0) * rng.uniform(0.05, 0.9)
            Lam = manip_lambda_weight(V, p0, q, p)
            self.assertAlmostEqual(manipulated_price(V, p0, Lam, q), p, 10)
            # manipulator (lam=1, wealth Lam) vs calibrated rest: truth = p0
            loss = -expected_transfer(Lam, 1.0, q, p, p0)
            self.assertAlmostEqual(loss, manip_cost(V, p0, p), 10)

    def test_manipulator_loss_is_others_gain(self):
        V, p0, q, p = 2.0, 0.5, 0.9, 0.62
        Lam = manip_lambda_weight(V, p0, q, p)
        # others: lam=1, wealth V, belief p0 (calibrated); manipulator: lam=1, wealth Lam, belief q
        w, lam, qs = [V, Lam], [1.0, 1.0], [p0, q]
        self.assertAlmostEqual(price(w, lam, qs), p, 10)
        gain = expected_transfer(V, 1.0, p0, p, p0)
        self.assertAlmostEqual(gain, manip_cost(V, p0, p), 10)

    def test_small_shift_matches_lmsr_with_b_equal_2V(self):
        p0 = 0.5
        for d in (0.01, 0.02):
            k = manip_cost(1.0, p0, p0 + d)
            l = lmsr_cost(2.0, p0, p0 + d)   # b = 2V
            self.assertAlmostEqual(k / l, 1.0, delta=0.05)

    def test_kelly_stiffer_than_lmsr_near_extremes(self):
        self.assertGreater(manip_cost(0.5, 0.5, 0.95), 2 * lmsr_cost(1.0, 0.5, 0.95))

    def test_wealth_floor_for_fractional_kelly(self):
        # an expert that assigns ~0 to the realised outcome loses at most a factor (1-lam) per round
        w, lam, q = [1.0, 1.0], [0.4, 0.4], [1e-9, 0.5]
        w2, _ = step(w, lam, q, 1)
        self.assertGreaterEqual(w2[0], 1.0 * (1 - 0.4) - 1e-12)


if __name__ == "__main__":
    unittest.main()
