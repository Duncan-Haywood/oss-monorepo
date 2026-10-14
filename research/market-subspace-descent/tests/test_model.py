import math, random, unittest
from market_subspace_descent import *


def rand_spd(d, rng):
    B = [[rng.gauss(0, 1) for _ in range(d)] for _ in range(d)]
    A = matmul(B, transpose(B))
    return [[A[i][j] + (d if i == j else 0) * 0.3 for j in range(d)] for i in range(d)]


class T(unittest.TestCase):
    def test_linear_algebra(self):
        rng = random.Random(1)
        A = rand_spd(4, rng)
        I = matmul(A, inv(A))
        self.assertTrue(all(abs(I[i][j] - (i == j)) < 1e-10 for i in range(4) for j in range(4)))
        w, V = eig_sym(A)
        self.assertEqual(w, sorted(w))
        R = sqrt_sym(A); RR = matmul(R, R)
        self.assertTrue(all(abs(RR[i][j] - A[i][j]) < 1e-9 for i in range(4) for j in range(4)))

    def test_projector_is_A_orthogonal_idempotent(self):
        rng = random.Random(2)
        A = rand_spd(4, rng)
        U = [[rng.gauss(0, 1) for _ in range(2)] for _ in range(4)]
        P = projector(A, U)
        PP = matmul(P, P)
        self.assertTrue(all(abs(PP[i][j] - P[i][j]) < 1e-9 for i in range(4) for j in range(4)))
        AP = matmul(A, P)   # A P symmetric <=> P is A-self-adjoint
        self.assertTrue(all(abs(AP[i][j] - AP[j][i]) < 1e-9 for i in range(4) for j in range(4)))

    def test_closed_form_equicorrelated_rate(self):
        d = 5
        subs, pr = coordinate_subspaces(d)
        for c in [0.0, 0.5, 0.9]:
            A = equicorrelated(d, c)
            self.assertAlmostEqual(asymptotic_rate(A, subs, pr, iters=8000), equicorrelated_rate(d, c), places=4)
            self.assertAlmostEqual(rate_bound(A, subs, pr), (1 - c) / d, places=9)
            self.assertLessEqual(equicorrelated_rate(d, c), 1 - (1 - c) / d + 1e-12)
        self.assertAlmostEqual(equicorrelated_rate(d, 0.0), 1 - 1 / d, places=12)

    def test_bound_is_one_step_tight_for_worst_state(self):
        d = 4; A = equicorrelated(d, 0.6)
        subs, pr = coordinate_subspaces(d)
        rho = rate_bound(A, subs, pr)
        w, V = eig_sym(expected_whitened_projector(A, subs, pr))
        Ri = inv(sqrt_sym(A))
        e0 = [sum(Ri[i][j] * V[j][0] for j in range(d)) for i in range(d)]   # e = A^{-1/2} v_min
        c = second_moment_curve(A, e0, subs, pr, 1)
        self.assertAlmostEqual(c[1] / c[0], 1 - rho, places=10)

    def test_conjugate_bundles_remove_correlation(self):
        rng = random.Random(3)
        for d in (3, 5):
            A = rand_spd(d, rng)
            subs, pr = conjugate_subspaces(A)
            self.assertAlmostEqual(rate_bound(A, subs, pr), 1 / d, places=9)
            self.assertAlmostEqual(asymptotic_rate(A, subs, pr, iters=200), 1 - 1 / d, places=9)

    def test_exact_second_moment_matches_monte_carlo(self):
        d = 4; A = equicorrelated(d, 0.5); e0 = [1, -1, 2, 0.5]
        subs, pr = coordinate_subspaces(d)
        ex = second_moment_curve(A, e0, subs, pr, 12, kappa=0.8, S=[[0.09 if i == j else 0 for j in range(d)] for i in range(d)])
        mc = simulate(A, e0, subs, pr, 12, kappa=0.8, sigma=0.3, runs=6000, seed=4)
        for t in (0, 4, 12):
            self.assertLess(abs(ex[t] - mc[t]) / ex[t], 0.05)

    def test_maker_loss_telescopes_exactly(self):
        rng = random.Random(5)
        d = 4; A = rand_spd(d, rng)
        qs = [rng.gauss(0, 1) for _ in range(d)]
        q = [rng.gauss(0, 2) for _ in range(d)]
        loss = 0.0; q0 = list(q)
        for _ in range(30):   # arbitrary (even harmful) trades
            q2 = [q[i] + rng.gauss(0, 0.5) for i in range(d)]
            loss += trade_profit(A, q, q2, qs)
            q = q2
        e0 = [a - b for a, b in zip(q0, qs)]; eT = [a - b for a, b in zip(q, qs)]
        self.assertAlmostEqual(loss, (anorm2(A, e0) - anorm2(A, eT)) / 2, places=9)

    def test_noise_floor_and_rate(self):
        d = 5; I = [[1.0 if i == j else 0.0 for j in range(d)] for i in range(d)]
        subs, pr = coordinate_subspaces(d)
        for k in (1.0, 0.5, 0.2):
            fl, rt = noise_floor_diag(d, k, 1.0)
            cur = second_moment_curve(I, [2.0] * d, subs, pr, 600, kappa=k, S=I)
            self.assertAlmostEqual(cur[-1], fl, places=9)
            # deviation from floor decays at exactly the closed-form rate
            r = (cur[11] - fl) / (cur[10] - fl)
            self.assertAlmostEqual(r, rt, places=6)

    def test_running_mean_beats_any_constant_step_at_long_horizon(self):
        for T in (30, 100, 1000):
            self.assertLess(averaging_error(5, 1.0, 4.0, T), best_constant_kappa(5, 1.0, 4.0, T)[1])
        self.assertAlmostEqual(averaging_error(5, 1.0, 4.0, 0), 20.0)

    def test_running_mean_matches_simulation(self):
        rng = random.Random(6); d, T, sig, e0 = 3, 12, 1.0, 2.0
        tot = 0.0; runs = 30000
        for _ in range(runs):
            e = [e0] * d; n = [0] * d
            for _ in range(T):
                i = rng.randrange(d); n[i] += 1
                e[i] -= (1 / n[i]) * (e[i] - rng.gauss(0, sig))
            tot += sum(v * v for v in e)
        self.assertLess(abs(tot / runs - averaging_error(d, sig, e0 * e0, T)) / averaging_error(d, sig, e0 * e0, T), 0.03)

    def test_lmsr_kl_decreases_and_converges(self):
        th = [0.5, 0.25, 0.15, 0.10]
        subs, pr = coordinate_subspaces(3)
        kl = lmsr_run(th, subs, pr, 40, runs=40, seed=1)
        self.assertGreater(kl[0], 0.1)
        self.assertTrue(all(kl[t + 1] <= kl[t] + 1e-12 for t in range(40)))   # exact-minimising traders never raise mean KL
        self.assertLess(kl[40], 1e-2 * kl[0])


if __name__ == "__main__":
    unittest.main()
