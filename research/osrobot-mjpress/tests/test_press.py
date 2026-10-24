import math, sys, unittest
from pathlib import Path
HERE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(HERE / "experiments"))
import run  # noqa: E402


class T(unittest.TestCase):
    def test_hertz_analytic(self):
        # sphere R=4 mm, F=10 N, E=1 MPa, nu=0.5: E*=E/(2(1-nu^2))=2/3 MPa; a^3=3FR/(4E*)
        a = (3 * 10 * 0.004 / (4 * (1e6 / 1.5))) ** (1 / 3)
        self.assertAlmostEqual(run.hertz_area_cm2(10, 0.004, 1e6), math.pi * a * a * 1e4, places=9)

    def test_area_grows_with_force_and_softness(self):
        self.assertGreater(run.hertz_area_cm2(20, 0.004, 1e6), run.hertz_area_cm2(10, 0.004, 1e6))
        self.assertGreater(run.hertz_area_cm2(10, 0.004, 1e5), run.hertz_area_cm2(10, 0.004, 1e6))

    def test_share_under(self):
        self.assertEqual(run.share_under([1, 2, 3, 4], 1.0, 2.5), 0.5)

    def test_worst_peak_matches_mjface(self):
        face = (HERE.parent / "osrobot-mjface" / "experiments" / "results.txt").read_text().splitlines()
        row = [l.split() for l in face if l.startswith("75000  1000  0.20")][0]
        mine = [l.split() for l in (HERE / "experiments" / "results.txt").read_text().splitlines() if l.startswith("1000  0.20")][0]
        self.assertAlmostEqual(float(row[-1]), float(mine[4]), places=2)


if __name__ == "__main__":
    unittest.main()
