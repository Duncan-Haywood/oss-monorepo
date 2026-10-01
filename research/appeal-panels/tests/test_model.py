import math, random, unittest
from appeal_panels import *


class T(unittest.TestCase):
    def test_maj_known_values(self):
        self.assertAlmostEqual(maj(1, .7), .7)
        self.assertAlmostEqual(maj(3, .7), 3 * .49 * .3 + .343, places=12)
        self.assertAlmostEqual(maj(5, .5), .5)
        self.assertTrue(all(maj(n + 2, .7) > maj(n, .7) for n in range(1, 40, 2)))

    def test_product_law_in_efficient_window(self):
        a, V, j = .7, 100, 1
        ns = [3, 11, 27]
        for n in ns[1:]:
            lo, f, hi = window(n, a, V, j)
            self.assertTrue(lo <= f < hi)
        acc, cost, tiers, wapp = evaluate(ns, a, V, j)
        self.assertAlmostEqual(1 - acc, error_product(ns, a), places=12)
        self.assertEqual(wapp, 0.0)
        M = [maj(n, a) for n in ns]
        self.assertAlmostEqual(tiers, 1 + (1 - M[0]) + (1 - M[0]) * (1 - M[1]), places=12)
        self.assertAlmostEqual(cost, 3 + (1 - M[0]) * 11 + (1 - M[0]) * (1 - M[1]) * 27, places=10)

    def test_wasteful_regime_last_tier_decides(self):
        a, V, j = .7, 100, .05          # fees far below the wrong side's stake: both sides always appeal
        ns = [3, 9, 27]
        T_, W_ = policy(ns, a, V, j)
        self.assertEqual((T_, W_), ([False, True, True], [False, True, True]))
        acc, cost, tiers, _ = evaluate(ns, a, V, j)
        self.assertAlmostEqual(acc, wasteful_accuracy(ns, a), places=12)
        self.assertAlmostEqual(tiers, 3.0, places=12)
        self.assertLess(acc, 1 - error_product(ns, a))

    def test_no_appeal_regime(self):
        acc, cost, tiers, _ = evaluate([3, 9, 27], .7, 100, 50.0)
        self.assertAlmostEqual(acc, maj(3, .7), places=12)
        self.assertAlmostEqual(tiers, 1.0)

    def test_matches_monte_carlo(self):
        for ns, j, rho in [([3, 11, 27], 1, 0), ([3, 9, 27], 1, 0), ([3, 9, 27], .05, 0), ([3, 11, 27], 1, .3)]:
            ex = evaluate(ns, .7, 100, j, rho)
            mc = simulate(ns, .7, 100, j, rho, trials=60000, seed=5)
            self.assertAlmostEqual(ex[0], mc[0], delta=.006)
            self.assertAlmostEqual(ex[1], mc[1], delta=.02 * ex[1] + .05)
            self.assertAlmostEqual(ex[2], mc[2], delta=.02)

    def test_shared_bias_floor(self):
        a, rho = .7, .3
        for ns in ([3, 11, 27], [3, 11, 27, 81, 243]):
            acc = evaluate(ns, a, 100, 1, rho)[0]
            self.assertLessEqual(acc, rho * a + (1 - rho) + 1e-12)
            self.assertAlmostEqual(acc, rho * a + (1 - rho) * (1 - error_product(ns, a)), places=9) if policy(ns, a, 100, 1, rho)[1] == [False] * len(ns) else None
        # more tiers cannot lift accuracy past rho*a + (1-rho)
        self.assertLess(evaluate([3, 11, 27, 81, 243, 729], a, 1000, 1, rho)[0], rho * a + (1 - rho))

    def test_deterrence_size_and_shrinking_band(self):
        a, V, j = .7, 100, 1
        n = min_deterring_size(a, V, j)
        self.assertEqual(n, 11)
        self.assertLess(j * 9, V * (1 - maj(9, a)))
        self.assertGreaterEqual(j * 11, V * (1 - maj(11, a)))
        # a larger prize needs a larger deterring panel
        self.assertGreater(min_deterring_size(a, 1000, j), n)

    def test_deterrence_improves_accuracy_and_cost_over_waste(self):
        a, V = .7, 100
        ns = [3, 11, 27]
        eff = evaluate(ns, a, V, 1)
        waste = evaluate(ns, a, V, .05)
        self.assertGreater(eff[0], waste[0])
        self.assertLess(eff[1], waste[1])


if __name__ == "__main__":
    unittest.main()
