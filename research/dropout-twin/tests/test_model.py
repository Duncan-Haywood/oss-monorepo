import itertools, math, random, unittest
from dropout_twin import *


class M(unittest.TestCase):
    def brute(self, m, k, p, lam):
        q, r = qr(p, lam)
        pi = r / (1 - q + r)
        tot = 0.0
        for bits in itertools.product((0, 1), repeat=m):  # 1 = dropped
            pr = pi if bits[0] else 1 - pi
            for a, b in zip(bits, bits[1:]):
                pd = q if a else r
                pr *= pd if b else 1 - pd
            if m - sum(bits) < k:
                tot += pr
        return tot

    def test_dp_matches_enumeration(self):
        for m in (1, 2, 5, 8):
            for k in (1, 2, 3):
                for p, lam in ((0.1, 0.0), (0.1, 0.6), (0.3, 0.8)):
                    self.assertAlmostEqual(miss_markov(m, k, p, lam), self.brute(m, k, p, lam), places=12)

    def test_no_persistence_is_iid(self):
        for m in (1, 4, 9):
            for k in (1, 2):
                self.assertAlmostEqual(miss_markov(m, k, 0.15, 0.0), miss_iid(m, k, 0.15), places=12)

    def test_k1_closed_form_and_ratio(self):
        p, lam, m = 0.1, 0.6, 7
        self.assertAlmostEqual(miss_markov(m, 1, p, lam), miss_k1_markov(m, p, lam), places=14)
        ratio = miss_k1_markov(m, p, lam) / miss_iid(m, 1, p)
        self.assertAlmostEqual(ratio, (1 + lam * (1 - p) / p) ** (m - 1), places=9)

    def test_marginal_is_p_at_width_one(self):
        self.assertAlmostEqual(miss_markov(1, 1, 0.12, 0.7), 0.12, places=14)

    def test_chain_sampler_and_fit(self):
        rng = random.Random(3)
        mask = sample_mask(400000, 0.1, 0.6, rng)
        self.assertLess(abs(sum(mask) / len(mask) - 0.1), 0.005)
        q, r = fit_chain(mask)
        q0, r0 = qr(0.1, 0.6)
        self.assertLess(abs(q - q0), 0.01)
        self.assertLess(abs(r - r0), 0.003)

    def test_monte_carlo_matches_exact(self):
        rng = random.Random(4)
        for k, m in ((1, 3), (2, 6)):
            mc = scan_miss_mc(60000, 200, m, k, 0.15, 0.6, rng)
            ex = miss_markov(m, k, 0.15, 0.6)
            self.assertLess(abs(mc - ex), 4 * math.sqrt(ex * (1 - ex) / 60000) + 1e-4)

    def test_min_width_and_inflation(self):
        self.assertEqual(min_width(1e-3, lambda m: miss_iid(m, 1, 0.1)), 3)
        self.assertGreater(min_width(1e-3, lambda m: miss_markov(m, 1, 0.1, 0.6)), 3)
        pp = inflated_p(3, 1, 0.6, 0.1)
        self.assertAlmostEqual(miss_iid(3, 1, pp), miss_markov(3, 1, 0.1, 0.6), places=9)
        self.assertGreater(pp, 0.1)


if __name__ == "__main__":
    unittest.main()
