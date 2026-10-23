import math
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from society_milgramfit import human_cut_share, independent_two, p_star, per_viewer  # noqa: E402


class Fit(unittest.TestCase):
    def test_p_star_is_the_edge_of_a_norm(self):
        p = p_star(9)
        self.assertLess(human_cut_share(0.0, 9, p + 0.01), 0.5)
        self.assertGreater(human_cut_share(0.0, 9, p - 0.01), 0.5)

    def test_p_star_matches_lineup_regime(self):
        # society-lineup's p0 = 0.9 keeps a norm, 0.7 does not (M = 9)
        self.assertLess(p_star(9), 0.9)
        self.assertGreater(p_star(9), 0.7)

    def test_per_viewer_roundtrip(self):
        r = per_viewer(0.5, 10)
        self.assertAlmostEqual(1 - (1 - r) ** 10, 0.5)

    def test_independent_two(self):
        self.assertAlmostEqual(independent_two(0.5), 0.75)
        self.assertTrue(math.isclose(independent_two(0.0), 0.0))


if __name__ == "__main__":
    unittest.main()
