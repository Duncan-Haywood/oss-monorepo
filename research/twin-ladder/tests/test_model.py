import math, random, statistics as st, unittest
from twin_ladder import *


class M(unittest.TestCase):
    def test_one_twin_reduces_to_twin_evaluation(self):
        for rho, r in ((0.8, 0.05), (0.5, 0.2)):
            self.assertAlmostEqual(ladder_var([1, rho], [1, r]), (math.sqrt(1 - rho ** 2) + rho * math.sqrt(r)) ** 2, places=12)

    def test_alloc_spends_budget_and_attains_optimum(self):
        rhos, costs = [1, 0.95, 0.8], [1, 0.1, 0.01]
        m = ladder_alloc(rhos, costs, 500.0)
        self.assertAlmostEqual(sum(x * y for x, y in zip(m, costs)), 500.0, places=9)
        self.assertAlmostEqual(int_var(rhos, m), ladder_var(rhos, costs, 500.0), places=12)
        self.assertTrue(feasible(rhos, costs))

    def test_rung_pays_matches_variance_sign(self):
        for rho1 in (0.7, 0.9, 0.98):
            for x in (0.5, 0.8, 0.95):
                for r in (0.02, 0.1, 0.4):
                    g = rung_gain(rho1, rho1 * x, 0.2, 0.2 * r)
                    if abs(x - rho_star(r)) > 1e-6:
                        self.assertEqual(g < 0, rung_pays(rho1, rho1 * x, 0.2, 0.2 * r), (rho1, x, r))

    def test_paying_rung_is_feasible_and_nonpaying_is_dropped(self):
        v, sub = best_ladder([(0.9, 0.1), (0.6, 0.09)], 1.0)     # second twin barely cheaper, much worse: dominated
        self.assertEqual(sub, (0,))
        v2, sub2 = best_ladder([(0.95, 0.2), (0.8, 0.01)], 1.0)
        self.assertEqual(sub2, (0, 1))
        self.assertLess(v2, v)

    def test_simulated_variance_and_unbiasedness(self):
        rhos, costs, C = [0.9, 0.75], [1, 0.1, 0.01], 60.0
        ms = [max(1, round(x)) for x in ladder_alloc([1] + rhos, costs, C)]
        ms = sorted(ms)
        rng = random.Random(3)
        mus = [1.0, 1.7, 0.4]
        # optimal alpha_i = rho_i (unit variances)
        est = [mfmc_estimate(sample_chain(ms[-1], mus, rhos, rng), ms, rhos) for _ in range(3000)]
        self.assertAlmostEqual(st.mean(est), 1.0, delta=4 * st.pstdev(est) / math.sqrt(3000))
        self.assertAlmostEqual(st.pvariance(est) / int_var([1] + rhos, ms), 1.0, delta=0.08)


if __name__ == "__main__":
    unittest.main()
