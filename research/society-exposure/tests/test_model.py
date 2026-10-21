import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "society-converts" / "src"))
from society_exposure import matched_c, simulate  # noqa: E402
import society_converts  # noqa: E402


class Exposure(unittest.TestCase):
    def test_deterministic(self):
        a = simulate(60, 0.2, 0.3, 5, 0.02, 3, 0.0, 60, seed=3)
        self.assertEqual(a, simulate(60, 0.2, 0.3, 5, 0.02, 3, 0.0, 60, seed=3))

    def test_no_robots_no_conversion(self):
        r = simulate(60, 0.0, 0.3, 5, 0.02, 1, 0.0, 100, seed=1)
        self.assertAlmostEqual(r["final_stubborn"], 0.3, places=1)

    def test_everyone_converts_with_many_robots_and_k1(self):
        r = simulate(60, 0.4, 0.3, 5, 0.02, 1, 0.0, 100, seed=1)
        self.assertEqual(r["final_stubborn"], 0.0)

    def test_higher_k_never_converts_more(self):
        lo = [simulate(100, 0.2, 0.4, 5, 0.02, 1, 0.0, 60, seed=s)["final_stubborn"] for s in range(4)]
        hi = [simulate(100, 0.2, 0.4, 5, 0.02, 30, 0.0, 60, seed=s)["final_stubborn"] for s in range(4)]
        self.assertLessEqual(sum(lo), sum(hi))

    def test_k_none_c_zero_matches_society_converts(self):
        a = simulate(60, 0.2, 0.3, 5, 0.02, None, 0.0, 60, seed=5)
        b = society_converts.simulate(60, 0.2, 0.3, 5, 0.02, 0.0, 60, seed=5)
        self.assertEqual(a["tip_round"], b["tip_round"])

    def test_matched_rate(self):
        self.assertAlmostEqual(matched_c(0.2, 4), 0.05)


if __name__ == "__main__":
    unittest.main()
