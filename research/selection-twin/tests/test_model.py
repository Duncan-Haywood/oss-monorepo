import math, random, unittest
from selection_twin import *


class M(unittest.TestCase):
    def test_expected_max_normal_known_values(self):
        self.assertAlmostEqual(expected_max_normal(1), 0.0, places=12)
        self.assertAlmostEqual(expected_max_normal(2), 1 / math.sqrt(math.pi), places=6)
        self.assertAlmostEqual(expected_max_normal(3), 1.5 / math.sqrt(math.pi), places=6)
        self.assertAlmostEqual(expected_max_normal(5), 1.16296447, places=6)

    def test_theory_identities(self):
        t = theory(20, 3.0, 0.7, 1.2)
        self.assertAlmostEqual(t["optimism"], t["real"] - t["claimed"], places=12)
        self.assertAlmostEqual(t["regret"], t["real"] - t["oracle"], places=12)
        self.assertAlmostEqual(t["optimism"], 1.2 ** 2 * t["c_K"] / math.sqrt(0.7 ** 2 + 1.2 ** 2), places=12)
        z = theory(20, 3.0, 0.7, 0.0)  # noiseless twin: claim = real = oracle
        self.assertAlmostEqual(z["optimism"], 0.0, places=12)
        self.assertAlmostEqual(z["regret"], 0.0, places=12)
        self.assertAlmostEqual(theory(1, 3.0, 0.7, 1.2)["optimism"], 0.0, places=12)

    def test_theory_matches_simulation(self):
        rng = random.Random(3)
        n = 20000
        r = [gauss_select(10, 0.0, 1.0, 1.0, rng) for _ in range(n)]
        t = theory(10, 0.0, 1.0, 1.0)
        for j, key in enumerate(("claimed", "real", "oracle")):
            self.assertAlmostEqual(sum(x[j] for x in r) / n, t[key], delta=0.04)

    def test_optimism_grows_in_K_and_real_cost_falls_in_K_for_fixed_noise(self):
        opt = [theory(K, 0, 1, 1)["optimism"] for K in (2, 5, 20, 100)]
        real = [theory(K, 0, 1, 1)["real"] for K in (2, 5, 20, 100)]
        self.assertEqual(opt, sorted(opt))
        self.assertEqual(real, sorted(real, reverse=True))

    def test_fixed_budget_has_interior_optimum(self):
        Ks = [1, 2, 3, 5, 8, 13, 21, 50, 100, 500, 2000]
        K, val = best_K(0.0, 1.0, 40.0, 10.0, Ks)
        self.assertTrue(1 < K < 2000)
        self.assertLess(val, theory(1, 0, 1, 2)["real"])
        self.assertLess(val, theory(2000, 0, 1, math.sqrt(40 * 2000 / 10))["real"])

    def test_lq_cost_matches_long_rollout(self):
        a, b, k, s, r = 1.1, 1.0, 0.7, 0.2, 0.1
        rng = random.Random(5)
        sc, var = rollout_score(a, b, k, s, r, 2000, 200, rng)
        self.assertAlmostEqual(sc, lq_cost(a, b, k, s, r), delta=4 * math.sqrt(var))
        self.assertEqual(lq_cost(a, b, 0.0, s, r), float("inf"))

    def test_eb_shrinks_toward_mean_and_keeps_order_when_homoskedastic(self):
        sc = [1.0, 2.0, 5.0, 3.0]
        post, m_hat, v2 = eb_posterior(sc, [0.5] * 4)
        self.assertAlmostEqual(m_hat, 2.75)
        self.assertEqual(sorted(range(4), key=post.__getitem__), sorted(range(4), key=sc.__getitem__))
        for p, q in zip(post, sc):
            self.assertLess(abs(p - m_hat), abs(q - m_hat) + 1e-12)

    def test_eb_changes_choice_when_noise_differs(self):
        # candidate 0 has the lowest score but is very noisy; shrinkage should prefer the precise candidate 1
        post, _, _ = eb_posterior([0.0, 0.3, 2.0, 2.2, 1.8, 2.1], [4.0, 0.01, 0.01, 0.01, 0.01, 0.01])
        self.assertEqual(min(range(6), key=post.__getitem__), 1)

    def test_screen_verify_claim_is_less_biased(self):
        rng = random.Random(9)
        n = 8000
        one = [gauss_select(50, 0.0, 1.0, 1.0, rng) for _ in range(n)]
        two = [screen_verify(50, 0.0, 1.0, 1.0, 5, 1.0, rng) for _ in range(n)]
        bias1 = sum(r - c for c, r, _ in one) / n
        bias2 = sum(r - c for c, r, _ in two) / n
        self.assertLess(bias2, bias1)
        self.assertGreater(bias1, 0.5)


if __name__ == "__main__":
    unittest.main()
