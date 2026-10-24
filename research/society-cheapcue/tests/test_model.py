import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))
from society_cheapcue import reader, yield_all  # noqa: E402
sys.path.insert(0, str(ROOT.parent / "society-fakeurgency" / "src"))
from society_fakeurgency import summary as fake_summary  # noqa: E402
sys.path.insert(0, str(ROOT.parent / "society-urgentdoor" / "src"))
from society_urgentdoor import solve  # noqa: E402


class Model(unittest.TestCase):
    def test_rho_one_is_fakeurgency(self):
        a, b = reader(0.3, 0.4, 0.4), fake_summary(0.3, 0.0, 1.0, 0.4)
        for key in ("cU", "cN", "cR", "crowd"):
            self.assertAlmostEqual(a[key], b[key], places=6)

    def test_free_cue_no_faking_is_perfect_reading(self):
        s = reader(0.3, 0.0, 9.0)  # urgent signal free, normal never
        ref = solve(0.3, 0.0, 1.0, 0.2, 3.0, 3.0)
        self.assertAlmostEqual(s["cU"], ref["cU"], delta=0.01)
        self.assertAlmostEqual(s["cN"], ref["cN"], delta=0.01)

    def test_cheaper_for_urgent_helps_urgent(self):
        v = [reader(0.3, rho * 0.6, 0.6)["cU"] for rho in (1.0, 0.5, 0.25, 0.0)]
        self.assertTrue(all(a > b for a, b in zip(v, v[1:])))

    def test_faking_set_by_normal_cost_only(self):
        a, b = reader(0.3, 0.0, 0.6), reader(0.3, 0.3, 0.6)
        self.assertAlmostEqual(a["sN"], b["sN"], delta=0.01)

    def test_crowd_never_beats_yield_all(self):
        Y = yield_all(0.3)
        for rho in (1.0, 0.5, 0.0):
            for c in (0.2, 0.6, 1.2):
                self.assertGreater(reader(0.3, rho * c, c)["crowd"], Y["crowd"])

    def test_yield_all_baseline_matches_urgentdoor(self):
        ref = solve(0.3, 0.0, 0.0, 0.2, 3.0, 3.0)
        self.assertAlmostEqual(yield_all(0.3)["cU"], ref["cU"], places=3)


if __name__ == "__main__":
    unittest.main()
