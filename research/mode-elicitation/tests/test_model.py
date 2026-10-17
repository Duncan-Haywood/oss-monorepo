import math, random, unittest
from mode_elicitation import *


class T(unittest.TestCase):
    def test_strictly_proper_grid(self):
        comps = [(0.7, 0.0), (0.3, 4.0)]
        m = alpha_mode(1.0, comps)
        for r in [m + d for d in (-2, -.5, -.05, .05, .5, 2)]:
            self.assertGreater(window_regret(r, 1.0, comps), 0)
        self.assertAlmostEqual(window_regret(m, 1.0, comps), 0, 9)

    def test_mode_picks_heavier_component(self):
        comps = [(0.7, 0.0), (0.3, 6.0)]
        self.assertLess(abs(alpha_mode(1.0, comps)), 0.1)
        self.assertGreater(abs(mixture_mean(comps)), 1.7)

    def test_curvature_matches_regret(self):
        for kind, al in (("normal", 1.0), ("normal", 0.4), ("cauchy", 0.5)):
            d = 1e-2
            reg = window_regret(d, al, [(1.0, 0.0)], kind)
            self.assertAlmostEqual(reg / (curvature(al, kind) * d * d), 1, 3)

    def test_best_alpha(self):
        grid = [i / 1000 for i in range(50, 4000)]
        self.assertAlmostEqual(max(grid, key=lambda a: curvature(a, "normal", 1.0)), 1.0, 2)
        self.assertAlmostEqual(max(grid, key=lambda a: curvature(a, "cauchy", 1.0)), 1 / math.sqrt(3), 2)

    def test_critical_alpha(self):
        mu, s = 5.0, 1.0
        ac = critical_alpha(mu, s)
        comps = [(.5, 0.0), (.5, mu)]
        self.assertGreater(abs(alpha_mode(ac * 0.9, comps) - mu / 2), 0.05)   # split modes below
        self.assertLess(abs(alpha_mode(ac * 1.1, comps) - mu / 2), 1e-3)      # single mode above
        self.assertEqual(critical_alpha(1.8, 1.0), 0.0)

    def test_diff_stats_vs_simulation(self):
        rng = random.Random(1)
        comps = [(0.6, 0.0), (0.4, 3.0)]
        al, r, rs = 1.0, 2.0, alpha_mode(1.0, comps)
        mean, var = diff_stats(r, rs, al, comps)
        ds = []
        for _ in range(200000):
            y = rng.gauss(0, 1) if rng.random() < 0.6 else rng.gauss(3, 1)
            ds.append((abs(y - r) > al) - (abs(y - rs) > al))
        m = sum(ds) / len(ds)
        v = sum((d - m) ** 2 for d in ds) / len(ds)
        self.assertAlmostEqual(m, mean, 2)
        self.assertAlmostEqual(v, var, 2)
        self.assertAlmostEqual(mean, window_regret(r, al, comps), 9)

    def test_empirical_mode(self):
        rng = random.Random(2)
        xs = [rng.gauss(0, 1) for _ in range(3000)] + [rng.gauss(6, 1) for _ in range(1000)]
        self.assertLess(abs(empirical_alpha_mode(xs, 1.0)), 0.3)


if __name__ == "__main__":
    unittest.main()
