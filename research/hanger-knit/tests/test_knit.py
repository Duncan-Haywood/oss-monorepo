import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path[:0] = [str(ROOT / "hanger-knit" / "src")]
from hanger_knit.knit import CASES, case_garment, design, shape_err  # noqa: E402
from hanger_fit import model as hf  # noqa: E402


class TestKnit(unittest.TestCase):
    def test_tee_case_is_hanger_fit_tee(self):
        g, depth = case_garment("tee")
        self.assertEqual(g, hf.garment("M", "tee"))
        self.assertEqual(depth, 0.20)

    def test_score_matches_hanger_fit(self):
        h = hf.STOCK["wood-shaped"]
        hf.DEPTH = 0.20
        self.assertAlmostEqual(shape_err(h, "tee"), hf.score(h, hf.garment("M", "tee"))["err"], places=9)

    def test_depth_is_reset_per_case(self):
        h = hf.STOCK["wood-shaped"]
        a = shape_err(h, "soft-heavy-narrow")
        shape_err(h, "tee")
        self.assertAlmostEqual(shape_err(h, "soft-heavy-narrow"), a, places=9)

    def test_design_is_deterministic_and_improves(self):
        h1, e1, hist = design("tee", "cmaes", 0, 12)
        h2, e2, _ = design("tee", "cmaes", 0, 12)
        self.assertEqual((h1, e1), (h2, e2))
        self.assertLessEqual(hist[-1], hist[0])

    def test_cases_known(self):
        self.assertIn("soft-heavy", CASES)


if __name__ == "__main__":
    unittest.main()
