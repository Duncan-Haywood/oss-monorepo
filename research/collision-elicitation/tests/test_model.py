import math, random, unittest
from collision_elicitation import *


def rand_p(K, rng):
    w = [rng.random() + 0.05 for _ in range(K)]
    s = sum(w)
    return [x / s for x in w]


class T(unittest.TestCase):
    def test_score_is_proper_for_gamma_k(self):
        rng = random.Random(1)
        for k in (2, 3):
            p = rand_p(4, rng)
            g = gamma(p, k)
            for r in (0.0, 0.3, g, 0.9):
                self.assertAlmostEqual(expected_score(r, p, k), expected_score_enum(r, p, k), places=12)
            best = max((expected_score(r / 100, p, k), r / 100) for r in range(101))
            self.assertLess(abs(best[1] - g), 0.006)
            self.assertAlmostEqual(expected_score(g, p, k) - expected_score(0.5, p, k), (0.5 - g) ** 2, places=12)

    def test_u_variance_exact(self):
        rng = random.Random(2)
        for K, n in [(3, 4), (3, 5), (4, 4)]:
            p = rand_p(K, rng)
            self.assertAlmostEqual(u_var(p, n), u_var_enum(p, n), places=12)

    def test_u_stat_unbiased_and_beats_disjoint(self):
        rng = random.Random(3)
        p = [0.6, 0.3, 0.1]
        for n in (6, 20, 60):
            self.assertLess(u_var(p, n), disjoint_var(p, n))
        g = gamma(p)
        m = sum(u_stat(rng.choices(range(3), p, k=30)) for _ in range(20000)) / 20000
        self.assertLess(abs(m - g), 0.003)

    def test_variance_ratio_limit(self):
        p = [0.5, 0.25, 0.25]
        g = gamma(p); z1 = gamma(p, 3) - g * g
        n = 10 ** 6
        self.assertAlmostEqual(u_var(p, n) / disjoint_var(p, n), 4 * z1 / (2 * g * (1 - g)), places=4)

    def test_one_sample_impossible(self):
        p, q = equal_gamma_pair()
        gp, gq, gm = level_set_witness(p, q)
        self.assertAlmostEqual(gp, gq, places=12)
        self.assertGreater(abs(gm - gp), 0.1)   # midpoint leaves the level set

    def test_fleet_and_contamination(self):
        self.assertAlmostEqual(fleet_gamma([0.25] * 4), 0.25)
        self.assertAlmostEqual(strict_fail_rate([0.5, 0.5], 2), 0.5)
        self.assertAlmostEqual(strict_fail_rate([0.5, 0.5], 3), 0.75)
        for g in (0.2, 0.7, 0.95):
            e = blind_spot(g)
            self.assertAlmostEqual(contaminated_gamma(g, e), g, places=12)
        self.assertGreater(contaminated_gamma(0.1, 0.3), 0.1)
        self.assertLess(contaminated_gamma(0.9, 0.3), 0.9)

    def test_f32_and_fleet_distribution(self):
        self.assertEqual(f32(0.1), 0.10000000149011612)
        rng = random.Random(4)
        vals = [rng.gauss(0, 1) for _ in range(40)]
        orders = kernel_orders(40, 4, rng)
        outs = class_outputs(vals, orders)
        d = output_distribution(outs, [0.25] * 4)
        self.assertAlmostEqual(sum(d.values()), 1.0)
        self.assertAlmostEqual(gamma(list(d.values())), sum(
            (sum(0.25 for o in outs if o == u)) ** 2 for u in set(outs)))

    def test_runs_needed_monotone(self):
        p = [0.7, 0.2, 0.1]
        self.assertLess(runs_needed(p, 0.05), runs_needed(p, 0.02))
        n = runs_needed(p, 0.03)
        self.assertLessEqual(1.96 * math.sqrt(u_var(p, n)), 0.03)


if __name__ == "__main__":
    unittest.main()
