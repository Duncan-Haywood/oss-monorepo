import math
import random
import unittest

from gnss_twin.model import (sats, hdop, solve, residual_stat, ar1, mean_var_factor, chi2_sf_even, chi2_isf_even,
                             coverage_of_claim, normal, inv3)


class T(unittest.TestCase):
    def test_symmetric_normal_matrix(self):
        for n in (4, 6, 9):
            N = normal(sats(n))
            for i, v in enumerate((n / 2, n / 2, n)):
                self.assertAlmostEqual(N[i][i], v, places=12)
            self.assertAlmostEqual(N[0][1], 0, places=12)
            self.assertAlmostEqual(N[0][2], 0, places=12)

    def test_inverse(self):
        N = normal(sats(5, 0.3, 4.0))
        Q = inv3(N)
        for i in range(3):
            for j in range(3):
                self.assertAlmostEqual(sum(N[i][k] * Q[k][j] for k in range(3)), float(i == j), places=10)

    def test_hdop_symmetric(self):
        for n in (4, 7, 12):
            self.assertAlmostEqual(hdop(sats(n)), math.sqrt(4 / n), places=12)

    def test_clustered_is_worse(self):
        self.assertGreater(hdop(sats(8, 0, math.pi / 2)), 5 * hdop(sats(8)))

    def test_single_bias_map(self):
        n, i, b = 8, 3, 2.0
        az = sats(n)
        e = [0.0] * n
        e[i] = b
        dx, dy, db = solve(az, e)
        self.assertAlmostEqual(dx, 2 * b / n * math.cos(az[i]), places=12)
        self.assertAlmostEqual(dy, 2 * b / n * math.sin(az[i]), places=12)
        self.assertAlmostEqual(db, b / n, places=12)

    def test_residual_bias(self):
        n, b = 9, 1.5
        e = [0.0] * n
        e[2] = b
        self.assertAlmostEqual(residual_stat(sats(n), e), b * b * (1 - 3 / n), places=12)

    def test_mean_var_factor(self):
        self.assertAlmostEqual(mean_var_factor(10, 0.0), 0.1, places=12)
        self.assertAlmostEqual(mean_var_factor(1, 0.9), 1.0, places=12)
        self.assertLess(abs(mean_var_factor(20000, 0.9) - (1 + 0.9) / (1 - 0.9) / 20000), 1e-4)
        rng = random.Random(1)
        T_, rho, reps = 15, 0.8, 40000
        v = sum((sum(ar1(rng, T_, rho, 1.0)) / T_) ** 2 for _ in range(reps)) / reps
        self.assertLess(abs(v / mean_var_factor(T_, rho) - 1), 0.03)

    def test_chi2(self):
        self.assertAlmostEqual(chi2_sf_even(2.0, 2), math.exp(-1), places=12)
        for dof in (2, 4, 6):
            self.assertAlmostEqual(chi2_sf_even(chi2_isf_even(0.05, dof), dof), 0.05, places=9)
        self.assertAlmostEqual(chi2_isf_even(0.05, 2), 2 * math.log(20), places=6)

    def test_coverage(self):
        self.assertAlmostEqual(coverage_of_claim(1, 1), 0.95)
        self.assertAlmostEqual(coverage_of_claim(1, 2), 1 - math.sqrt(0.05))


if __name__ == "__main__":
    unittest.main()
