import itertools, math, random, unittest
from hetero_pipeline import *


def exact_dp(w, v, mem=None, cap=None):
    """Independent exact DP for a fixed order: minimise max stage time over all contiguous cuts (zero-size stages allowed)."""
    L, m = len(w), len(v)
    pre = [0.0]
    for x in w:
        pre.append(pre[-1] + x)
    pm = [0.0]
    for x in (mem or [0] * L):
        pm.append(pm[-1] + x)
    INF = math.inf
    f = [[INF] * (L + 1) for _ in range(m + 1)]
    f[0][0] = 0.0
    for j in range(1, m + 1):
        for i in range(L + 1):
            for k in range(i + 1):
                if mem is not None and pm[i] - pm[k] > cap[j - 1] + 1e-12:
                    continue
                f[j][i] = min(f[j][i], max(f[j - 1][k], (pre[i] - pre[k]) / v[j - 1]))
    return f[m][L]


class T(unittest.TestCase):
    def test_greedy_matches_dp_fixed_order(self):
        rng = random.Random(1)
        for _ in range(60):
            L, m = rng.randint(3, 9), rng.randint(2, 4)
            w, v = random_instance(rng, L, m, 0.7, 0.6)
            self.assertAlmostEqual(bottleneck(w, v), exact_dp(w, v), 8)

    def test_greedy_matches_dp_with_memory(self):
        rng = random.Random(2)
        for _ in range(60):
            L, m = rng.randint(4, 9), rng.randint(2, 4)
            w, v = random_instance(rng, L, m, 0.5, 0.5)
            mem = [rng.uniform(0.5, 2) for _ in range(L)]
            cap = [rng.uniform(2, 6) for _ in range(m)]
            a, b = bottleneck(w, v, mem, cap), exact_dp(w, v, mem, cap)
            if math.isinf(b):
                self.assertTrue(math.isinf(a))
            else:
                self.assertAlmostEqual(a, b, 8)

    def test_bounds_hold_for_every_order(self):
        rng = random.Random(3)
        for _ in range(40):
            w, v = random_instance(rng, rng.randint(4, 12), 4, 0.8, 0.8)
            for perm in itertools.permutations(range(4)):
                t = bottleneck(w, [v[k] for k in perm])
                self.assertGreaterEqual(t, lower_bound(w, v) - 1e-9)
                self.assertLessEqual(t, upper_bound(w, v) + 1e-9)

    def test_equal_speeds_unit_layers(self):
        self.assertAlmostEqual(bottleneck([1.0] * 12, [1.0] * 4), 3.0, 8)
        self.assertAlmostEqual(bottleneck([1.0] * 13, [1.0] * 4), 4.0, 8)

    def test_bruteforce_beats_or_ties_heuristics(self):
        rng = random.Random(4)
        for _ in range(15):
            w, v = random_instance(rng, 10, 5, 0.6, 0.8)
            best, _ = best_order_bruteforce(w, v)
            for kind in ("given", "desc", "asc", "valley"):
                self.assertLessEqual(best, order_heuristic(w, v, kind)[0] + 1e-9)
            self.assertLessEqual(best, local_search_order(w, v)[0] + 1e-9)

    def test_order_matters(self):
        w, v = [4.0, 3.0, 4.0, 3.0, 5.0], [1.0, 2.0, 2.0]
        self.assertAlmostEqual(bottleneck(w, v), 4.0, 6)
        self.assertAlmostEqual(bottleneck(w, v[::-1]), 5.0, 6)

    def test_cuts_cover_all_layers(self):
        rng = random.Random(5)
        w, v = random_instance(rng, 20, 5, 0.5, 0.5)
        T_ = bottleneck(w, v)
        self.assertEqual(sum(cuts(w, v, T_)), 20)

    def test_equal_split_ratio_continuum(self):
        w, v = [1.0] * 6000, [1.0, 2.0, 4.0, 5.0]
        r = equal_split_time(w, v) / (sum(w) / sum(v))
        self.assertAlmostEqual(r, (sum(v) / 4) / min(v), 2)


if __name__ == "__main__":
    unittest.main()
