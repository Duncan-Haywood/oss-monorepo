import math, random, unittest
from input_twin import *


class M(unittest.TestCase):
    def test_wq(self):
        self.assertAlmostEqual(wq(0.9, 1.0), 9.0)
        self.assertEqual(wq(1.0, 1.0), math.inf)

    def test_betainc_known(self):
        self.assertAlmostEqual(betainc(1, 1, 0.3), 0.3, places=12)
        self.assertAlmostEqual(betainc(7, 7, 0.5), 0.5, places=12)
        x = 0.4  # I_x(2,3) = sum_{j=2}^{4} C(4,j) x^j (1-x)^(4-j)
        exact = sum(math.comb(4, j) * x ** j * (1 - x) ** (4 - j) for j in range(2, 5))
        self.assertAlmostEqual(betainc(2, 3, x), exact, places=12)

    def test_p_unstable_symmetry(self):
        self.assertAlmostEqual(p_unstable(1.0, 20), 0.5, places=12)
        self.assertLess(p_unstable(0.5, 50), p_unstable(0.9, 50))

    def test_p_unstable_monte_carlo(self):
        rng = random.Random(3)
        rho, n, reps = 0.9, 20, 40000
        hits = sum(1 for _ in range(reps) if (lambda f: f[0] >= f[1])(fit(rng, rho, n)))
        self.assertAlmostEqual(hits / reps, p_unstable(rho, n), delta=0.008)

    def test_rel_sd_delta_method(self):
        rng = random.Random(4)
        rho, n, reps = 0.5, 4000, 6000
        ws = [math.log(wq(*fit(rng, rho, n))) for _ in range(reps)]
        m = sum(ws) / reps
        sd = math.sqrt(sum((w - m) ** 2 for w in ws) / reps)
        self.assertAlmostEqual(sd / rel_sd(rho, n), 1.0, delta=0.04)

    def test_n_required_inverts_rel_sd(self):
        for rho in (0.3, 0.9):
            self.assertAlmostEqual(rel_sd(rho, n_required(rho, 0.1)), 0.1, places=12)

    def test_bounds_above_point_estimate_mostly(self):
        rng = random.Random(5)
        lh, mh = fit(rng, 0.7, 300)
        self.assertGreater(delta_bound(lh, mh, 300, 300), wq(lh, mh))
        self.assertGreater(boot_bound(rng, lh, mh, 300, 300), wq(lh, mh) * 0.95)


if __name__ == "__main__":
    unittest.main()
