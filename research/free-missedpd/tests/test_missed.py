import math, os, sys, unittest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import missed as M

H0 = 0.1


class T(unittest.TestCase):
    def test_poles_at_r(self):
        for r in (0.0, 0.3, 0.9):
            kp, kd = M.gains(r, H0)
            A = M.step_matrix(H0, kp, kd)
            tr = A[0][0] + A[1][1]
            det = A[0][0] * A[1][1] - A[0][1] * A[1][0]
            self.assertAlmostEqual(tr, 2 * r, places=12)
            self.assertAlmostEqual(det, r * r, places=12)

    def test_step_matrix_matches_fine_integration(self):
        kp, kd = M.gains(0.5, H0)
        h, n = 0.3, 300000
        x, v = 1.0, -0.5
        u = -kp * x - kd * v
        for _ in range(n):  # exact ZOH of x''=u is polynomial; a fine Euler-Cromer run agrees to ~1e-5
            v += u * h / n
            x += v * h / n
        (a, b), (c, d) = M.step_matrix(h, kp, kd)
        self.assertAlmostEqual(x, a * 1.0 + b * -0.5, places=4)
        self.assertAlmostEqual(v, c * 1.0 + d * -0.5, places=4)

    def test_no_misses_gives_nominal(self):
        self.assertAlmostEqual(M.lyapunov(0.0, 0.5, H0, n=2000), math.log(0.5), places=2)
        self.assertTrue(M.ms_stable(0.0, 0.5, H0))

    def test_moment_matches_direct_enumeration(self):
        # one step from (1,0): E|state|^2 = sum_m p_m (a_m^2 + c_m^2)
        q, r = 0.3, 0.5
        kp, kd = M.gains(r, H0)
        direct = sum(p * (M.step_matrix(m * H0, kp, kd)[0][0] ** 2 + M.step_matrix(m * H0, kp, kd)[1][0] ** 2)
                     for m, p in enumerate(M.miss_law(q), 1))
        self.assertAlmostEqual(M.exact_moment(q, r, H0, 1), direct, places=9)

    def test_operator_against_monte_carlo(self):
        ex = M.exact_moment(0.1, 0.5, H0, 3)
        mc, _ = M.mc_moment(0.1, 0.5, H0, 3, 60000, seed=5)
        self.assertLess(abs(mc - ex) / ex, 0.03)

    def test_jury_agrees_with_power_iteration(self):
        for q in (0.1, 0.2, 0.4):
            T3 = M.second_moment_op(q, 0.5, H0)
            P = [1.0, 0.3, 0.7]
            for _ in range(3000):
                P = [sum(T3[i][j] * P[j] for j in range(3)) for i in range(3)]
                s = abs(P[0]) + abs(P[1]) + abs(P[2])
                P = [x / s for x in P]
            rho = sum(abs(sum(T3[i][j] * P[j] for j in range(3))) for i in range(3))
            self.assertEqual(M.cubic_stable(T3), rho < 1)

    def test_miss_law_sums_to_one(self):
        self.assertAlmostEqual(sum(M.miss_law(0.6)), 1.0, places=12)

    def test_mean_square_stricter_than_almost_sure(self):
        qms = M.bisect_q(lambda q: M.ms_stable(q, 0.5, H0))
        qas = M.bisect_q(lambda q: M.lyapunov(q, 0.5, H0, n=40000) < 0)
        self.assertLess(qms, qas)

    def test_bisect(self):
        self.assertAlmostEqual(M.bisect_q(lambda x: x < 0.3, tol=1e-6), 0.3, places=5)


if __name__ == "__main__":
    unittest.main()
