import math
import unittest

import qualml as q


class Agreement(unittest.TestCase):
    def test_kappa_perfect_and_chance(self):
        self.assertEqual(q.cohen_kappa([1, 0, 1, 0], [1, 0, 1, 0]), 1.0)
        self.assertAlmostEqual(q.cohen_kappa([1, 1, 0, 0], [1, 0, 1, 0]), 0.0)

    def test_kappa_textbook(self):
        # 20 yes/yes, 5 yes/no, 10 no/yes, 15 no/no: po 0.7, pe 0.5 -> 0.4
        a = [1] * 25 + [0] * 25
        b = [1] * 20 + [0] * 5 + [1] * 10 + [0] * 15
        self.assertAlmostEqual(q.cohen_kappa(a, b), 0.4)

    def test_alpha_perfect(self):
        self.assertEqual(q.krippendorff_alpha_nominal([[1, 1], [0, 0], [2, 2, None]]), 1.0)

    def test_alpha_krippendorff_example(self):
        # Krippendorff (2011) "Computing Krippendorff's alpha-reliability", nominal example: 0.743
        units = [[1, 1, None, 1], [2, 2, 3, 2], [3, 3, 3, 3], [3, 3, 3, 3], [2, 2, 2, 2],
                 [1, 2, 3, 4], [4, 4, 4, 4], [1, 1, 2, 1], [2, 2, 2, 2], [None, 5, 5, 5],
                 [None, None, 1, 1], [None, None, 3, None]]
        self.assertAlmostEqual(q.krippendorff_alpha_nominal(units), 0.743, places=3)

    def test_alpha_two_coders_close_to_kappa(self):
        a = [1] * 25 + [0] * 25
        b = [1] * 20 + [0] * 5 + [1] * 10 + [0] * 15
        alpha = q.krippendorff_alpha_nominal([[x, y] for x, y in zip(a, b)])
        self.assertAlmostEqual(alpha, q.cohen_kappa(a, b), delta=0.02)


class Estimators(unittest.TestCase):
    def test_ppi_equals_human_when_llm_is_constant(self):
        # with a useless constant coder, PPI's estimate is the human mean
        human = [1, 0, 0, 1, 1]
        est, _ = q.ppi([0] * 100, [0] * 5, human)
        self.assertAlmostEqual(est, q.mean(human))

    def test_ppi_exact_when_llm_perfect_on_gold(self):
        llm_all = [1, 0, 1, 0, 0, 1, 1, 0]
        est, se = q.ppi(llm_all, [1, 0, 1], [1, 0, 1])
        self.assertAlmostEqual(est, q.mean(llm_all))
        self.assertAlmostEqual(se, math.sqrt(q.var(llm_all) / 8))

    def test_ppi_rejects_bad_gold(self):
        with self.assertRaises(ValueError):
            q.ppi([1, 0], [1], [1, 0])

    def test_effective_n(self):
        self.assertAlmostEqual(q.effective_n(0.05, 0.10, 100), 400)

    def test_gap_and_covers(self):
        g = q.gap((0.3, 0.03), (0.2, 0.04))
        self.assertAlmostEqual(g[0], 0.1)
        self.assertAlmostEqual(g[1], 0.05)
        self.assertTrue(q.covers(g, 0.15))
        self.assertFalse(q.covers(g, 0.25))


class Simulation(unittest.TestCase):
    def test_simulated_coder_rates(self):
        rng = q.seeded(7)
        truth, llm = q.simulate_corpus(40000, 0.3, 0.75, 0.95, rng)
        pos = [f for t, f in zip(truth, llm) if t]
        neg = [f for t, f in zip(truth, llm) if not t]
        self.assertAlmostEqual(q.mean(truth), 0.3, delta=0.01)
        self.assertAlmostEqual(q.mean(pos), 0.75, delta=0.015)
        self.assertAlmostEqual(1 - q.mean(neg), 0.95, delta=0.01)

    def test_naive_biased_ppi_unbiased(self):
        rng = q.seeded(11)
        naive, ppi = [], []
        for _ in range(200):
            r = q.run_once(2000, 0.3, 0.75, 0.95, 200, rng)
            naive.append(r["naive"][0] - r["truth"])
            ppi.append(r["ppi"][0] - r["truth"])
        self.assertLess(q.mean(naive), -0.03)   # expected -0.04
        self.assertLess(abs(q.mean(ppi)), 0.01)

    def test_ppi_coverage_near_nominal(self):
        rng = q.seeded(13)
        hits = [q.covers(r["ppi"], r["truth"]) for r in (q.run_once(2000, 0.3, 0.8, 0.9, 150, rng) for _ in range(300))]
        self.assertGreater(q.mean(hits), 0.9)


if __name__ == "__main__":
    unittest.main()
