import math, random, unittest
from balanced_routing import *


def batch(B=60, N=4, seed=1, means=(0.6, 0.2, 0.0, -0.3)):
    return gaussian_scores(B, N, random.Random(seed), list(means[:N]))


class T(unittest.TestCase):
    def test_grad_matches_finite_difference(self):
        S = batch(); c = [0.25] * 4; tau = 0.5; p = [0.1, 0.3, 0.0, 0.2]
        g = dual_grad(S, p, tau, c)
        for i in range(4):
            q = p[:]; q[i] += 1e-6; r = p[:]; r[i] -= 1e-6
            fd = (dual(S, q, tau, c) - dual(S, r, tau, c)) / 2e-6
            self.assertAlmostEqual(g[i], fd, places=4)

    def test_solution_meets_capacity_and_complementarity(self):
        S = batch(); c = [0.25] * 4; tau = 0.5
        p, k = solve_dual(S, tau, c)
        L = loads(assign(S, p, tau))
        for pi, li in zip(p, L):
            self.assertLessEqual(li, 60 * 0.25 + 1e-4)
            if pi > 1e-9:
                self.assertAlmostEqual(li, 15.0, places=3)

    def test_slack_capacity_gives_zero_prices(self):
        S = batch(); tau = 0.5
        p, _ = solve_dual(S, tau, [1.0] * 4)
        self.assertTrue(all(pi == 0 for pi in p))

    def test_weak_duality_certificate_brackets_optimum(self):
        S = batch(); c = [0.3] * 4; tau = 0.5
        popt, _ = solve_dual(S, tau, c)
        lo, up, gap = certificate(S, popt, tau, c)
        self.assertLess(gap, 1e-5)
        for p in ([0.0] * 4, [0.3, 0.1, 0.0, 0.0], [1.0, 0.0, 0.0, 0.0]):
            lo2, up2, g2 = certificate(S, p, tau, c)
            self.assertLessEqual(lo2, up + 1e-6)
            self.assertGreaterEqual(up2, lo - 1e-6)
            self.assertGreaterEqual(g2, -1e-9)

    def test_lower_bound_is_feasible_primal(self):
        S = batch(); c = [0.3] * 4
        lo, up, gap = certificate(S, [0.0] * 4, 0.5, c)
        self.assertGreater(gap, 0)

    def test_dual_is_upper_bound_on_random_feasible_x(self):
        rng = random.Random(3); S = batch(30, 3, 5, (0.5, 0, -0.5)); c = [1 / 3] * 3; tau = 0.4
        p, _ = solve_dual(S, tau, c)
        up = dual(S, p, tau, c)
        for _ in range(50):
            X = [[1 / 3] * 3 for _ in S]
            for _ in range(200):  # random feasible perturbations keeping loads = 10 each (swap mass)
                a, b = rng.sample(range(30), 2); i, j = rng.sample(range(3), 2)
                d = min(0.05, X[a][j], X[b][i]) * rng.random()
                X[a][i] += d; X[a][j] -= d; X[b][i] -= d; X[b][j] += d
            self.assertLessEqual(primal_value(S, X, tau), up + 1e-9)

    def test_gauss_loss_closed_form_vs_monte_carlo(self):
        mu, sigma = 0.8, 1.0
        loss, t = gauss_balance_loss(mu, sigma, 0.5)
        rng = random.Random(0); n = 400000
        ds = [rng.gauss(mu, sigma) for _ in range(n)]
        mc = sum(d for d in ds if d > 0) / n - sum(d for d in ds if d > t) / n
        self.assertAlmostEqual(loss, mc, delta=0.006)
        self.assertAlmostEqual(t, mu, delta=1e-6)  # median of a Gaussian is its mean

    def test_gauss_loss_zero_when_already_balanced(self):
        loss, t = gauss_balance_loss(-0.5, 1.0, 0.5)  # expert 1 already used < half the time
        self.assertAlmostEqual(loss, 0.0, places=9)

    def test_sign_update_noise_floor_shrinks_with_batch(self):
        c = [0.25] * 4
        def floor(B):
            samp = lambda r: gaussian_scores(B, 4, r, [0.6, 0.2, 0.0, -0.3])
            _, errs = sign_update(samp, 4, c, 0.02, 0.5, 600, random.Random(2))
            return sum(abs(e) for e in errs[300:]) / 300
        self.assertLess(floor(1024), floor(64))

    def test_audit_sample_size_covers(self):
        N, eps, delta = 4, 0.05, 0.05
        m = audit_samples(N, eps, delta)
        rng = random.Random(9); S = batch(5000, 4, 11); p = [0.2, 0.1, 0.0, 0.0]
        X = assign(S, p, 0.5); true = [l / 5000 for l in loads(X)]
        bad = 0
        for _ in range(300):
            idx = [rng.randrange(5000) for _ in range(m)]
            est = [sum(X[k][i] for k in idx) / m for i in range(4)]
            bad += max(abs(a - b) for a, b in zip(est, true)) > eps
        self.assertLessEqual(bad / 300, delta)


if __name__ == "__main__":
    unittest.main()
