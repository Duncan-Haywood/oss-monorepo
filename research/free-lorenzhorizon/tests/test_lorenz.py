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
        self.assertAlmostEqual(lam, 0.9056, delta=0.05)

    def test_horizon_monotone_in_delta(self):
        s = lorenz.spin_up()
        self.assertGreater(lorenz.horizon(s, 1e-8, 1.0), lorenz.horizon(s, 1e-4, 1.0))


if __name__ == "__main__":
    unittest.main()
