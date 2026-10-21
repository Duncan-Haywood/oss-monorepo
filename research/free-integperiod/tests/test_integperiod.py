import math, os, sys, unittest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from integperiod import exact_period, simulate, energy


class T(unittest.TestCase):
    def test_small_angle_limit(self):
        self.assertAlmostEqual(exact_period(1e-4, 1.0), 2 * math.pi, places=7)

    def test_published_value(self):
        # Large-angle series: T/T0 = 1 + th0^2/16 + 11 th0^4/3072 ... ; 90 deg -> 1.18034 (K(sin45)=1.854075)
        self.assertAlmostEqual(exact_period(math.pi / 2, 1.0) / (2 * math.pi), 1.180340599, places=8)

    def test_rk4_matches_exact(self):
        t0 = 1.0
        p, d, n = simulate("rk4", t0, 0.001, 30.0)
        self.assertLess(abs(p / exact_period(t0) - 1), 1e-8)

    def test_euler_energy_grows_semi_bounded(self):
        _, de, _ = simulate("euler", 1.0, 0.01, 60.0)
        _, ds, _ = simulate("semi", 1.0, 0.01, 60.0)
        self.assertGreater(de, 0.5)
        self.assertLess(abs(ds), 0.05)

    def test_second_order_convergence(self):
        T0 = exact_period(1.2)
        e1 = abs(simulate("verlet", 1.2, 0.004, 40.0)[0] - T0)
        e2 = abs(simulate("verlet", 1.2, 0.002, 40.0)[0] - T0)
        self.assertAlmostEqual(math.log2(e1 / e2), 2.0, delta=0.3)

    def test_semi_and_verlet_conjugate_at_exact_energy(self):
        a = simulate("semi", 1.2, 0.004, 120.0, start="bottom")[0]
        b = simulate("verlet", 1.2, 0.004, 120.0, start="bottom")[0]
        self.assertAlmostEqual(a, b, delta=1e-7)
        self.assertGreater(abs(a - exact_period(1.2)) / exact_period(1.2), 1e-7)


if __name__ == "__main__":
    unittest.main()
