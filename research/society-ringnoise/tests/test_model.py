import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))
from society_ringnoise import resampled  # noqa: E402


class Resampled(unittest.TestCase):
    def test_no_robots_stays_on_r(self):
        self.assertLess(resampled(rho=0.0, sweeps=50), 0.05)

    def test_many_robots_tip_everyone(self):
        self.assertGreater(resampled(rho=0.5, sweeps=50), 0.95)

    def test_deterministic_for_seed(self):
        self.assertEqual(resampled(rho=0.12, sweeps=30, seed=3), resampled(rho=0.12, sweeps=30, seed=3))

    def test_more_robots_tip_at_least_as_much_on_average(self):
        lo = sum(resampled(rho=0.04, sweeps=60, seed=s) for s in range(4))
        hi = sum(resampled(rho=0.3, sweeps=60, seed=s) for s in range(4))
        self.assertGreater(hi, lo)


if __name__ == "__main__":
    unittest.main()
