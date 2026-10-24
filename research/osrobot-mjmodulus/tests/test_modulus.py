import math, sys, unittest
from pathlib import Path
HERE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(HERE / "experiments"))
import run  # noqa: E402


class T(unittest.TestCase):
    def test_hertz_analytic(self):
        # F=10 N, R=4 mm, E=1 MPa, nu=0.5: E*=4/3 MPa, a^3 = 3FR/(4E*)
        a, d, p = run.hertz(10, 0.004, 1e6)
        self.assertAlmostEqual(a ** 3, 3 * 10 * 0.004 / (4 * 1e6 / 0.75), places=15)
        self.assertAlmostEqual(d, a * a / 0.004)
        self.assertAlmostEqual(p, 10 / (math.pi * a * a) / 1e4)

    def test_softer_gives_lower_pressure(self):
        self.assertLess(run.hertz(20, 0.004, 1e4)[2], run.hertz(20, 0.004, 1e5)[2])

    def test_mean_pressure_scaling(self):
        # p ~ E^(2/3): x8 modulus -> x4 pressure
        self.assertAlmostEqual(run.hertz(20, 0.004, 8e4)[2] / run.hertz(20, 0.004, 1e4)[2], 4.0, places=9)

    def test_small_tip_soft_face_invalid(self):
        a = run.hertz(53.3, 0.004, 45e3)[0]
        self.assertFalse(run.valid(a, 0.004))

    def test_force_matches_mjpress(self):
        self.assertAlmostEqual(run.worst_peaks()[(1000, 0.20)], 53.30, places=2)


if __name__ == "__main__":
    unittest.main()
