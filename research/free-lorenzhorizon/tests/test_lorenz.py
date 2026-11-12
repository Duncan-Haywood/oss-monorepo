import os, sys, unittest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import lorenz


class T(unittest.TestCase):
    def test_fixed_point(self):
        b = lorenz.BETA
        c = (b * (lorenz.RHO - 1)) ** 0.5
        d = lorenz.f((c, c, lorenz.RHO - 1), (lorenz.SIGMA, lorenz.RHO, b))
        self.assertTrue(all(abs(v) < 1e-12 for v in d))

    def test_rk4_order(self):
        s = (1.0, 2.0, 3.0); p = (lorenz.SIGMA, lorenz.RHO, lorenz.BETA)
        def run(h):
            u = s
            for _ in range(int(0.5 / h)): u = lorenz.rk4(u, p, h)
            return u
        ref = run(0.0005)
        e1 = lorenz.dist(run(0.01), ref); e2 = lorenz.dist(run(0.005), ref)
        self.assertGreater(e1 / e2, 12)  # ~16 for 4th order

    def test_lyapunov_published(self):
        # Sprott / Viswanath: lambda_1 = 0.9056 for sigma=10, rho=28, beta=8/3
        lam = lorenz.lyapunov(lorenz.spin_up(), t=200.0)
        self.assertAlmostEqual(lam, 0.9056, delta=0.02)

    def test_horizon_monotone_in_delta(self):
        s = lorenz.spin_up()
        self.assertGreater(lorenz.horizon(s, 1e-8, 1.0), lorenz.horizon(s, 1e-4, 1.0))

    def test_fixed_point_hardcoded(self):
        # C+ = (sqrt(72), sqrt(72), 27) for sigma=10, rho=28, beta=8/3, written out
        c = 72 ** 0.5
        d = lorenz.f((c, c, 27.0), (lorenz.SIGMA, lorenz.RHO, lorenz.BETA))
        self.assertTrue(all(abs(v) < 1e-12 for v in d))
        self.assertEqual((lorenz.SIGMA, lorenz.RHO), (10.0, 28.0))
        self.assertAlmostEqual(lorenz.BETA, 8 / 3, places=15)

    def test_parameter_error_alone_diverges(self):
        # exact start, wrong rho: the twin must leave the tolerance well before tmax
        s = lorenz.spin_up()
        t = lorenz.horizon(s, 0.0, 1.0, twin_p=(10.0, 28.0 * 1.001, 8 / 3))
        self.assertGreater(t, 0)
        self.assertLess(t, 30)

    def test_horizon_matches_lyapunov_prediction(self):
        # mean horizon at d0=1e-6 over 10 attractor points ~ ln(1e6)/0.9056 - ~0.9 (results.txt offset)
        s = lorenz.spin_up(); p = (lorenz.SIGMA, lorenz.RHO, lorenz.BETA); ts = []
        for _ in range(10):
            for _ in range(400): s = lorenz.rk4(s, p, 0.005)
            ts.append(lorenz.horizon(s, 1e-6, 1.0))
        pred = __import__("math").log(1e6) / 0.9056 - 0.9
        self.assertAlmostEqual(sum(ts) / len(ts), pred, delta=1.5)

    def test_horizon_counts_steps_exactly(self):
        # a twin started beyond tol is flagged after the first step: exactly h
        s = lorenz.spin_up()
        self.assertAlmostEqual(lorenz.horizon(s, 2.0, 1.0, h=0.005), 0.005, places=12)


if __name__ == "__main__":
    unittest.main()
