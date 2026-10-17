import math, unittest
from heterogeneous_steps import *

A = [1.0, 0.25, 0.05]
ETA, SG = 0.2, 1.0


class T(unittest.TestCase):
    def test_identical_workers_match_noisy_local_sgd(self):
        N, H, al = 5, 4, 0.8
        got = floor_weighted(A, ETA, SG, [H] * N, weights_equal([H] * N), al)
        want = sum(0.5 * a * al * (worker_noise(ETA, a, SG, H) / N) / (curvature(ETA, a, H) * (2 - al * curvature(ETA, a, H))) for a in A)
        self.assertAlmostEqual(got, want, places=12)

    def test_info_is_tanh(self):
        a = 0.25
        lam = -math.log(1 - ETA * a)
        for H in (1, 3, 20):
            self.assertAlmostEqual(info(ETA, a, SG, H), info_inf(ETA, a, SG) * math.tanh(lam * H / 2), places=10)

    def test_info_weights_are_optimal_single_mode(self):
        Hs = [1, 3, 9, 40]
        a = 0.25
        self.assertAlmostEqual(penalty_single(ETA, a, SG, Hs, weights_info(Hs, ETA, a)), 1.0, places=12)
        for w in (weights_equal(Hs), weights_steps(Hs), [0.1, 0.2, 0.3, 0.4]):
            self.assertGreaterEqual(penalty_single(ETA, a, SG, Hs, w), 1.0 - 1e-12)

    def test_optimal_floor_closed_form(self):
        Hs, a, al = [2, 5, 30], 0.25, 0.9
        w = weights_info(Hs, ETA, a)
        r = al * sum(wi * curvature(ETA, a, h) for wi, h in zip(w, Hs))
        direct = floor_weighted([a], ETA, SG, Hs, w, al)
        self.assertAlmostEqual(direct, 0.5 * a * floor_single_optimal(ETA, a, SG, Hs, r), places=12)

    def test_equal_weights_within_kantorovich(self):
        for Hs in ([1, 256], [1, 1, 1, 1, 64], [1, 2, 4, 8, 16, 32, 64]):
            for a in (0.02, 0.25, 1.0, 2.0):
                self.assertLessEqual(penalty_single(ETA, a, SG, Hs, weights_equal(Hs)), kantorovich_bound(2) + 1e-9)

    def test_step_weighting_is_worse_than_equal(self):
        Hs = [1, 1, 1, 1, 1, 1, 1, 256]
        self.assertGreater(penalty_single(ETA, 1.0, SG, Hs, weights_steps(Hs)), 1.5)

    def test_simulation_matches(self):
        Hs = [1, 4, 32]
        for w in (weights_equal(Hs), weights_steps(Hs)):
            th = floor_weighted(A, ETA, SG, Hs, w, 1.0)
            emp = sim_floor(A, ETA, SG, Hs, w, 1.0, 60000, 1000, seed=3)
            self.assertAlmostEqual(emp / th, 1.0, delta=0.04)

    def test_unstable_is_inf(self):
        self.assertTrue(math.isinf(floor_weighted([1.0], ETA, SG, [50], [1.0], 2.5)))

    def test_sync_cost_raises_best_H(self):
        hs = [best_H_per_wallclock(ETA, 0.25, C) for C in (0, 5, 20, 100)]
        self.assertEqual(hs[0], 1)
        self.assertEqual(hs, sorted(hs))


if __name__ == "__main__":
    unittest.main()
