import math
import random
import unittest
from peer_noise_rent import *


class T(unittest.TestCase):
    def test_infinite_sample_pay_is_2p1p_gi_gj(self):
        p, ai, bi, aj, bj = .3, .8, .7, .75, .9
        t = joint(p, ai, bi, aj, bj)
        self.assertAlmostEqual(sum(x[2] for x in t), 1, 12)
        gi, gj = ai + bi - 1, aj + bj - 1
        self.assertAlmostEqual(fresh_stats(t, 10 ** 9)[0], 2 * p * (1 - p) * gi * gj, 12)
        self.assertAlmostEqual(2 * table_stats(t)[4], 2 * p * (1 - p) * gi * gj, 12)

    def test_plugin_variance_exact_by_enumeration(self):
        t = joint(.4, .8, .7, .75, .9)
        for n in (2, 3, 5):
            m, v = enumerate_plugin(t, n)
            pm, pv = plugin_stats(t, n)
            self.assertAlmostEqual(m, pm, 10)
            self.assertAlmostEqual(v, pv, 10)

    def test_plugin_equals_agreement_minus_plugin_penalty(self):
        pairs = [(1, 1), (0, 1), (1, 0), (1, 1), (0, 0)]
        n = len(pairs)
        fi = sum(u for u, _ in pairs) / n
        fj = sum(v for _, v in pairs) / n
        direct = sum(u == v for u, v in pairs) / n - (fi * fj + (1 - fi) * (1 - fj))
        self.assertAlmostEqual(score_plugin(pairs), direct, 12)

    def test_constant_reporter_gets_exactly_zero_under_plugin(self):
        rng = random.Random(1)
        t = joint(.5, 1., 0., .8, .8)
        for _ in range(50):
            self.assertAlmostEqual(score_plugin(sample_pairs(t, 30, rng)), 0, 12)

    def test_fresh_variance_matches_simulation(self):
        t = joint(.5, .8, .8, .8, .8)
        rng = random.Random(2)
        n = 60
        xs = [score_fresh(sample_pairs(t, n, rng), sample_pairs(t, n, rng)) for _ in range(20000)]
        m = sum(xs) / len(xs)
        v = sum((x - m) ** 2 for x in xs) / (len(xs) - 1)
        fm, fv = fresh_stats(t, n)
        self.assertAlmostEqual(m, fm, delta=.004)
        self.assertAlmostEqual(v / fv, 1, delta=.06)

    def test_plugin_less_noisy_than_fresh_at_null_by_sqrt2(self):
        t = joint(.5, .5, .5, .8, .8)
        pv = plugin_stats(t, 10 ** 6)[1]
        fv = fresh_stats(t, 10 ** 6)[1]
        self.assertAlmostEqual(fv / pv, 2, delta=1e-3)

    def test_normal_rent_and_deductible(self):
        self.assertAlmostEqual(normal_rent(0, 1), 1 / math.sqrt(2 * math.pi), 12)
        tau = deductible_for_rent(.05, .03, .002)
        self.assertAlmostEqual(normal_rent(.05, .03, tau), .002, 8)
        self.assertEqual(deductible_for_rent(0, .001, 1), 0.0)

    def test_sample_size_power(self):
        alt = joint(.5, .75, .75, .8, .8)
        null = joint(.5, .5, .5, .8, .8)
        big = 10 ** 9
        m = plugin_stats(alt, big)[0]
        s1 = math.sqrt(plugin_stats(alt, big)[1] * big)
        s0 = math.sqrt(plugin_stats(null, big)[1] * big)
        n = math.ceil(sample_size(m, s1, s0, .05, .05))
        cut = phi_inv(.95) * s0 / math.sqrt(n)
        rng = random.Random(3)
        pw = sum(score_plugin(sample_pairs(alt, n, rng)) > cut for _ in range(4000)) / 4000
        self.assertAlmostEqual(pw, .95, delta=.025)

    def test_ranking_table_is_difference_of_scores(self):
        t = rank_table(.5, .85, .85, .7, .7, .8, .8)
        one = joint(.5, .85, .85, .8, .8)
        two = joint(.5, .7, .7, .8, .8)
        self.assertAlmostEqual(2 * table_stats(t)[4], 2 * table_stats(one)[4] - 2 * table_stats(two)[4], 12)


if __name__ == "__main__":
    unittest.main()
