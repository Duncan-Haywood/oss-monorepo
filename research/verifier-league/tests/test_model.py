import math, random, unittest
from verifier_league import *


class T(unittest.TestCase):
    def test_best_is_closest_report(self):
        rs = [.3, .55, .9]
        self.assertEqual(best(rs, .6), 1)
        L = [loss(r, .6) for r in rs]
        self.assertEqual(L.index(min(L)), 1)

    def test_pair_growth_is_kl_to_midpoint(self):
        for ri, rj, q in [(.55, .72, .6), (.4, .6, .45), (.8, .3, .7)]:
            d1, d0 = diffs(ri, rj)
            g = max(q * math.log(1 + l * d1) + (1 - q) * math.log(1 + l * d0) for l in [k / 20000 for k in range(1, 20000)]
                    if 1 + l * d1 > 0 and 1 + l * d0 > 0)
            if mean_diff(ri, rj, q) > 0:
                self.assertAlmostEqual(g, pair_rate(ri, rj, q), places=4)
            else:
                self.assertEqual(pair_rate(ri, rj, q), 0.0)

    def test_break_even_is_midpoint(self):
        self.assertAlmostEqual(mean_diff(.3, .8, midpoint(.3, .8)), 0.0, places=12)

    def test_binding_competitor_is_not_always_runner_up(self):
        rs = [.55, .52, .72, .30, .85, .42]   # q=.6: runner-up .52 is same-side, binding is opposite-side .72
        b, j = binding(rs, .6)
        self.assertEqual(b, 0)
        self.assertEqual(rs[runner_up(rs, .6)], .52)
        self.assertEqual(rs[j], .72)
        r = rates_vs(rs, .6, b)
        self.assertLess(r[2], r[1])

    def test_same_side_rival_is_easier_than_mirror_rival_of_equal_loss_rank(self):
        # best .55 at q=.6; rivals at equal distance .08 on either side
        same, opp = .52, .68
        self.assertGreater(pair_rate(.55, same, .6), 0)
        self.assertGreater(pair_rate(.55, same, .6), pair_rate(.55, opp, .6))

    def test_log_e_from_counts_matches_running_league(self):
        rs = [.5, .7, .2]
        L = League(rs)
        rng = random.Random(3)
        n1 = n0 = 0
        for _ in range(60):
            y = rng.random() < .55
            L.step(y)
            n1 += y; n0 += (not y)
        for (i, j) in L.pairs:
            self.assertAlmostEqual(L.log_k(i, j), log_e(n1, n0, rs[i], rs[j]), places=9)

    def test_e_value_antisymmetry_no_double_rejection(self):
        # if i beats j with evidence, j cannot also beat i: K_ij * K_ji <= 1 by Jensen-type bound is not exact,
        # but both cannot exceed 1/alpha=20 on the same data
        rs = [.4, .7]
        rng = random.Random(4)
        for _ in range(200):
            n1 = sum(rng.random() < .5 for _ in range(150))
            a, b = log_e(n1, 150 - n1, .4, .7), log_e(n1, 150 - n1, .7, .4)
            self.assertFalse(a >= math.log(20) and b >= math.log(20))

    def test_delay_prediction_matches_simulation(self):
        rs, q = [.8, .3, .55, .1], .7
        pred = delay_prediction(rs, q, .05)
        rng = random.Random(6)
        ts = [simulate_certify(rs, q, .05, int(pred * 8), rng)[1] for _ in range(60)]
        self.assertLess(0.9, sum(ts) / len(ts) / pred)
        self.assertLess(sum(ts) / len(ts) / pred, 1.6)

    def test_certifies_the_right_verifier(self):
        rs, q = [.8, .3, .55, .1], .7
        rng = random.Random(8)
        res = [simulate_certify(rs, q, .05, 8000, rng)[0] for _ in range(40)]
        self.assertGreaterEqual(sum(r == best(rs, q) for r in res), 38)

    def test_exact_tie_error_below_alpha(self):
        rs, q = [.4, .6, .05, .95], .5
        rng = random.Random(10)
        hit = sum(simulate_certify(rs, q, .05, 300, rng)[0] is not None for _ in range(600))
        self.assertLessEqual(hit / 600, .05 + .02)

    def test_elimination_stops_no_later_than_certification(self):
        rs, q = [.8, .3, .55, .1], .7
        for seed in range(5):
            _, tc = simulate_certify(rs, q, .05, 8000, random.Random(seed))
            _, te, _, _ = simulate_eliminate(rs, q, .05, 8000, random.Random(seed))
            self.assertLessEqual(te, tc)


if __name__ == "__main__":
    unittest.main()
