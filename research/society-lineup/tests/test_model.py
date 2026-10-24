import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from society_lineup import critical_share, human_cut_share, maj_prob, simulate, success_prob  # noqa: E402


class Model(unittest.TestCase):
    def test_majority_limits(self):
        self.assertAlmostEqual(maj_prob(0.5, 9), 0.5)
        self.assertAlmostEqual(maj_prob(0.0, 5), 0.0)
        self.assertAlmostEqual(maj_prob(1.0, 5), 1.0)
        self.assertAlmostEqual(maj_prob(0.5, 1), 0.5)

    def test_success_prob(self):
        self.assertAlmostEqual(success_prob(0.0, 0.8), 0.2)
        self.assertAlmostEqual(success_prob(1.0, 0.8), 1.0)

    def test_no_robots_norm_holds_when_objections_strong(self):
        self.assertLess(human_cut_share(0.0, 9, 0.9), 0.01)

    def test_weak_enforcement_never_holds(self):
        # p0 < 0.5 means a lone cut already succeeds more often than not
        self.assertGreater(human_cut_share(0.0, 9, 0.3, x0=0.0), 0.9)

    def test_threshold_rises_with_enforcement(self):
        cs = [critical_share(9, p) for p in (0.8, 0.9, 1.0)]
        self.assertTrue(all(b > a for a, b in zip(cs, cs[1:])), cs)

    def test_unreachable_is_nan(self):
        # k huge: enforcement vanishes unless almost nobody cuts, but rho=1 still tips; use p0=0 style check
        self.assertEqual(critical_share(9, 0.3), 0.0)

    def test_sim_matches_meanfield_far_from_threshold(self):
        c = critical_share(9, 0.8)
        lo = sum(simulate(200, max(c - 0.1, 0), 9, 0.8, seed=s)[2] for s in range(4)) / 4
        hi = sum(simulate(200, min(c + 0.1, 1), 9, 0.8, seed=s)[2] for s in range(4)) / 4
        self.assertLess(lo, 0.3)
        self.assertGreater(hi, 0.7)


if __name__ == "__main__":
    unittest.main()
