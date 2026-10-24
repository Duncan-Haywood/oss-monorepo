import math, os, sys, unittest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from keplerdrift import exact, energy, kepler_E, run, precession_per_orbit


class T(unittest.TestCase):
    def test_kepler_equation(self):
        for e in (0.0, 0.5, 0.9, 0.99):
            for M in (0.1, 1.0, 3.0, 6.0):
                E = kepler_E(M, e)
                self.assertAlmostEqual(E - e * math.sin(E), M, places=12)

    def test_exact_orbit_conserves_energy_and_closes(self):
        for e in (0.0, 0.3, 0.9):
            self.assertAlmostEqual(energy(exact(1.234, e)), -0.5, places=12)
            a, b = exact(0.0, e), exact(2 * math.pi, e)
            self.assertAlmostEqual(math.dist(a[:2], b[:2]), 0.0, places=10)

    def test_circular_period_is_two_pi(self):
        x, y, *_ = exact(math.pi / 2, 0.0)
        self.assertAlmostEqual(x, 0.0, places=12)
        self.assertAlmostEqual(y, 1.0, places=12)

    def test_rk4_is_fourth_order(self):
        a = run("rk4", 0.3, 100, 1)["pos_err"]
        b = run("rk4", 0.3, 200, 1)["pos_err"]
        self.assertAlmostEqual(math.log2(a / b), 4.0, delta=0.4)

    def test_verlet_is_second_order(self):
        a = run("verlet", 0.3, 200, 1)["pos_err"]
        b = run("verlet", 0.3, 400, 1)["pos_err"]
        self.assertAlmostEqual(math.log2(a / b), 2.0, delta=0.3)

    def test_euler_gains_energy_symplectic_bounded(self):
        self.assertGreater(run("euler", 0.0, 200, 10)["dE"], 0.1)
        self.assertLess(run("semi", 0.0, 200, 10)["worst_dE"], 0.01)

    def test_symplectic_precesses_rk4_barely(self):
        p = abs(precession_per_orbit("semi", 0.5, 100, 1))
        q = abs(precession_per_orbit("rk4", 0.5, 100, 1))
        self.assertGreater(p, 100 * q)


if __name__ == "__main__":
    unittest.main()
