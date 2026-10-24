import math, os, random, sys, unittest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import jitter as J


class T(unittest.TestCase):
    def test_gain_hits_rho(self):
        for rho in (0.0, 0.5, 0.8):
            k = J.gain_for(1.0, 0.5, rho)
            self.assertAlmostEqual(J.g(1.0, k, 0.5), rho, places=12)

    def test_zero_jitter_matches_nominal(self):
        k = J.gain_for(1.0, 0.5, 0.5)
        lyap, m2 = J.moments(1.0, k, J.uniform_nodes(0.5, 0.0, 5))
        self.assertAlmostEqual(m2, 0.25, places=10)
        self.assertAlmostEqual(lyap, math.log(0.5), places=10)

    def test_jensen(self):
        k = J.gain_for(1.0, 0.5, 0.5)
        lyap, m2 = J.moments(1.0, k, J.uniform_nodes(0.5, 0.6))
        self.assertLessEqual(2 * lyap, math.log(m2) + 1e-12)

    def test_drop_moments_exact(self):
        k = J.gain_for(1.0, 0.5, 0.5)
        n, w = J.drop_law(0.5, 0.2)
        _, m2 = J.moments(1.0, k, n, w)
        self.assertAlmostEqual(m2, 0.8 * 0.25 + 0.2 * J.g(1.0, k, 1.0) ** 2, places=12)

    def test_threshold(self):
        self.assertAlmostEqual(J.threshold(lambda x: x < 0.3, 0, 1), 0.3, places=9)
        self.assertIsNone(J.threshold(lambda x: x < 0, 0.1, 1))

    def test_simulation_matches_lyapunov(self):
        k = J.gain_for(1.0, 0.5, 0.8)
        nodes = J.uniform_nodes(0.5, 0.5)
        lyap, _ = J.moments(1.0, k, nodes)
        rng = random.Random(1)
        _, med = J.simulate(1.0, k, lambda r: 0.5 * (1 + 0.5 * (2 * r.random() - 1)), 400, 40, rng)
        self.assertAlmostEqual(med, lyap, delta=0.02)


if __name__ == "__main__":
    unittest.main()
