import math, random, unittest
from precision_scores import *


class T(unittest.TestCase):
    def test_linear_algebra(self):
        rng = random.Random(0); S = random_spd(5, rng, 50)
        P = inverse(S); M = matmul(S, P)
        for i in range(5):
            for j in range(5):
                self.assertAlmostEqual(M[i][j], 1.0 if i == j else 0.0, places=9)

    def test_proper_and_misreport_cost_exact(self):
        rng = random.Random(1); S = random_spd(4, rng, 20); A = random_spd(4, rng, 5)
        for _ in range(20):
            D = [rng.gauss(0, 1) for _ in range(4)]
            self.assertAlmostEqual(expected_score(A, S, [0] * 4) - expected_score(A, S, D), quad(A, D), places=10)
            self.assertLess(expected_score(A, S, D), expected_score(A, S, [0] * 4))

    def test_gap_moments_monte_carlo_gaussian_and_heavy_tail(self):
        rng = random.Random(2); S = random_spd(3, rng, 8); A = random_spd(3, rng, 4); D = [.5, -.3, .8]
        L = cholesky(S); u = matvec(A, D)
        for law in (sample_gaussian, lambda L, r: sample_t(L, r, 8.0)):
            g = []
            for _ in range(60000):
                e = law(L, rng); g.append(quad(A, D) - 2 * sum(a * b for a, b in zip(u, e)))
            mean = sum(g) / len(g); var = sum((x - mean) ** 2 for x in g) / len(g)
            self.assertAlmostEqual(mean / gap_mean(A, D), 1.0, delta=0.03)
            self.assertAlmostEqual(var / gap_var(A, S, D), 1.0, delta=0.06)

    def test_precision_score_uniformly_optimal(self):
        rng = random.Random(3)
        for _ in range(200):
            d = rng.randint(2, 6); S = random_spd(d, rng, 30); A = random_spd(d, rng, 30)
            D = [rng.gauss(0, 1) for _ in range(d)]
            e = efficiency(A, S, D)
            self.assertLessEqual(e, 1 + 1e-9); self.assertGreater(e, 0)
            self.assertAlmostEqual(efficiency(inverse(S), S, D), 1.0, places=9)

    def test_scale_invariance(self):
        rng = random.Random(4); S = random_spd(3, rng, 9); A = random_spd(3, rng, 3); D = [1., 2., -1.]
        A2 = [[7.5 * x for x in r] for r in A]
        self.assertAlmostEqual(snr(A, S, D), snr(A2, S, D), places=10)

    def test_kantorovich_bound_and_attainment(self):
        rng = random.Random(5)
        for kappa in (1.0, 4.0, 100.0):
            lam = [1.0, kappa, math.sqrt(kappa)]; S = [[lam[i] if i == j else 0.0 for j in range(3)] for i in range(3)]
            I = identity(3); D = extremal_direction(lam)
            self.assertAlmostEqual(efficiency(I, S, D), kantorovich(kappa), places=10)
            for _ in range(500):
                D2 = [rng.gauss(0, 1) for _ in range(3)]
                self.assertGreaterEqual(efficiency(I, S, D2), kantorovich(kappa) - 1e-9)

    def test_power_matches_prediction(self):
        rng = random.Random(6); S = random_spd(3, rng, 20); D = [.6, .1, -.4]
        n = int(math.ceil(tasks_needed(S, D))); P = inverse(S)
        pw = power_sim(P, S, D, n, 600, rng)
        self.assertAlmostEqual(pw, 0.80, delta=0.07)
        # isotropic score at the same n has clearly lower power when the direction is ill-aligned
        Dbad = extremal_direction([1.0, 20.0, 1.0]); S2 = [[1, 0, 0], [0, 20, 0], [0, 0, 1.0]]
        n2 = int(math.ceil(tasks_needed(S2, Dbad)))
        self.assertGreater(power_sim(inverse(S2), S2, Dbad, n2, 400, rng), power_sim(identity(3), S2, Dbad, n2, 400, rng) + 0.15)


if __name__ == "__main__":
    unittest.main()
