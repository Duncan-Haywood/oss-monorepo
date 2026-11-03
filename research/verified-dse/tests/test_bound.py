import math
import random
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from verified_dse.bound import halve, inversion, kth_inversion, pair_value, pair_values, pairs_needed, pilot_quantile, pilot_top_inversion  # noqa: E402


def brute(s, y):
    return max([0.0] + [math.log(y[i]) - math.log(y[j]) for i in range(len(s)) for j in range(len(s)) if s[i] <= s[j]])


class T(unittest.TestCase):
    def test_kth_inversion_k1_is_inversion_and_nonincreasing(self):
        rng = random.Random(7)
        for _ in range(200):
            n = rng.randint(2, 14)
            s = [rng.randint(0, 5) for _ in range(n)]
            y = [rng.uniform(1, 20) for _ in range(n)]
            self.assertAlmostEqual(kth_inversion(s, y, 1), inversion(s, y))
            vals = [kth_inversion(s, y, k) for k in range(1, n + 1)]
            self.assertTrue(all(a >= b - 1e-12 for a, b in zip(vals, vals[1:])))

    def test_kth_bound_holds_for_random_halving(self):
        # the cut-k regret bound: regret <= sum of iota^(k_j), for any tie-break
        rng = random.Random(11)
        for _ in range(400):
            n = rng.randint(4, 30)
            rungs = [[rng.randint(0, 6) for _ in range(n)] for _ in range(2)]
            y = [rng.uniform(1, 50) for _ in range(n)]
            keep = [rng.randint(1, n), 0]
            keep[1] = rng.randint(1, keep[0])
            reg = math.log(halve(rungs, y, keep, random.Random(rng.random()))) - math.log(min(y))
            self.assertLessEqual(reg, sum(kth_inversion(r, y, k) for r, k in zip(rungs, keep)) + 1e-9)

    def test_anchored_bound_holds_and_is_below_kth(self):
        # milestone 39: regret <= max_j (kappa_j + sum_{l>j} iota^(k_l)) <= sum iota^(k_j)
        sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "experiments" / "theory"))
        from anchored import anchored
        rng = random.Random(13)
        for _ in range(400):
            n = rng.randint(4, 30)
            rungs = [[rng.randint(0, 6) for _ in range(n)] for _ in range(2)]
            y = [rng.uniform(1, 50) for _ in range(n)]
            keep = [rng.randint(1, n), 0]
            keep[1] = rng.randint(1, keep[0])
            reg = math.log(halve(rungs, y, keep, random.Random(rng.random()))) - math.log(min(y))
            a = anchored(rungs, y, keep)
            self.assertLessEqual(reg, a + 1e-9)
            self.assertLessEqual(a, sum(kth_inversion(r, y, k) for r, k in zip(rungs, keep)) + 1e-9)

    def test_perfect_and_reversed(self):
        self.assertEqual(inversion([1, 2, 3], [1, 2, 3]), 0.0)
        self.assertAlmostEqual(inversion([1, 2, 3], [3, 2, 1]), math.log(3))

    def test_ties_count_both_ways(self):
        self.assertAlmostEqual(inversion([1, 1], [1, 4]), math.log(4))

    def test_matches_brute_force(self):
        rng = random.Random(1)
        for _ in range(300):
            n = rng.randint(2, 12)
            s = [rng.randint(0, 5) for _ in range(n)]
            y = [rng.uniform(1, 20) for _ in range(n)]
            self.assertAlmostEqual(inversion(s, y), brute(s, y))

    def test_halving_regret_never_exceeds_sum_of_inversions(self):
        rng = random.Random(2)
        for _ in range(500):
            n = rng.randint(4, 40)
            y = [rng.uniform(1, 10) for _ in range(n)]
            rungs = [[v * math.exp(rng.gauss(0, sg)) if sg else rng.random() for v in y] for sg in (0.0, 0.3, 1.0)]
            keep = [max(1, n // 3), max(1, n // 9), 1][: rng.randint(1, 3)]
            cut = rungs[: len(keep)]
            got = halve(cut, y, keep, rng)
            lhs = math.log(got) - math.log(min(y))
            self.assertLessEqual(lhs, sum(inversion(s, y) for s in cut) + 1e-9)

    def test_max_pair_value_is_inversion(self):
        rng = random.Random(3)
        for _ in range(200):
            n = rng.randint(2, 30)
            y = [rng.uniform(1, 10) for _ in range(n)]
            s = [rng.choice([1, 2, 3, 4]) for _ in range(n)]
            self.assertAlmostEqual(max(pair_values(s, y)), inversion(s, y))

    def test_pairs_needed(self):
        self.assertEqual(pairs_needed(0.2, 0.2), 8)
        self.assertEqual(pairs_needed(0.1, 0.1), 22)

    def test_pilot_quantile_uses_disjoint_pairs(self):
        s, y = [1, 2, 3, 4], [4.0, 3.0, 2.0, 1.0]
        self.assertAlmostEqual(pilot_quantile(s, y, [0, 1, 2, 3]), math.log(2))
        self.assertEqual(pair_value(1, 2, 1.0, 2.0), 0.0)

    def test_top_inversion_widens_with_top(self):
        rng = random.Random(7)
        for _ in range(200):
            n = 12
            s = [rng.randint(0, 5) for _ in range(n)]
            y = [rng.uniform(1, 4) for _ in range(n)]
            idx = rng.sample(range(n), 8)
            vals = [pilot_top_inversion(s, y, idx, k) for k in (1, 3, 5)]
            self.assertEqual(vals, sorted(vals))

    def test_top_inversion(self):
        # rung ranks index 0 (y=8) ahead of the best point index 1 (y=2): inversion log 4; the pilot's best is index 1
        self.assertAlmostEqual(pilot_top_inversion([1, 2, 3], [8, 2, 4], [0, 1, 2], top=1), math.log(4))
        # a perfect rung has none
        self.assertEqual(pilot_top_inversion([1, 2, 3], [1, 2, 3], [0, 1, 2], top=2), 0.0)
        # never exceeds the full-pool inversion
        rng = random.Random(3)
        for _ in range(200):
            n = rng.randint(4, 12)
            s = [rng.randint(0, 5) for _ in range(n)]
            y = [rng.uniform(1, 20) for _ in range(n)]
            idx = rng.sample(range(n), rng.randint(2, n))
            self.assertLessEqual(pilot_top_inversion(s, y, idx, 3), inversion(s, y) + 1e-12)

    def test_no_quantile_of_g_bounds_halving_regret(self):
        # milestone 43: for any q < 1 - 1/n a pool exists whose q-quantile of g is 0 while halving loses log c
        sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "experiments" / "theory"))
        from quantile_counterexample import row
        for n in (30, 90, 300):
            reg, qb, g0, gmax = row(n, 3.0, qs=(0.5, 0.9, 1 - 1.5 / n))
            self.assertAlmostEqual(reg, math.log(3.0))
            self.assertTrue(all(v == 0.0 for v in qb.values()))
            self.assertAlmostEqual(g0, math.log(3.0))

    def test_rank_displacement_below_cut_size_gives_zero_regret(self):
        # milestone 44: if every cut j has fewer than k_j rivals ranked at or ahead of the optimum, halving returns it
        rng = random.Random(44)
        hits = 0
        for _ in range(600):
            n = rng.randint(6, 30)
            y = [rng.uniform(1, 20) for _ in range(n)]
            keep = [max(1, n // 3), max(1, n // 9)]
            scores = [[rng.randint(0, 6) if rng.random() < 0.5 else y[i] + rng.uniform(-8, 8) for i in range(n)] for _ in keep]
            star = min(range(n), key=lambda i: y[i])
            rho = [sum(1 for z in range(n) if z != star and s[z] <= s[star]) for s in scores]
            if all(r < k for r, k in zip(rho, keep)):
                hits += 1
                for seed in range(5):
                    self.assertEqual(halve(scores, y, keep, random.Random(seed)), y[star])
        self.assertGreater(hits, 20)


if __name__ == "__main__":
    unittest.main()
