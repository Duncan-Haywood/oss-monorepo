import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))
sys.path.insert(0, str(ROOT.parent / "society-allies" / "src"))
from society_ringmf import block_placement, fixed_point, majority_prob  # noqa: E402
import society_allies  # noqa: E402


class Majority(unittest.TestCase):
    def test_binomial_majority_known_values(self):
        self.assertAlmostEqual(majority_prob(0.5, 9), 0.5, places=12)  # symmetry, odd m
        self.assertAlmostEqual(majority_prob(0.5, 3), 0.5, places=12)
        self.assertAlmostEqual(majority_prob(0.0, 9), 0.0)
        self.assertAlmostEqual(majority_prob(1.0, 9), 1.0)
        # m = 3, q = 0.7: 3 * 0.49 * 0.3 + 0.343
        self.assertAlmostEqual(majority_prob(0.7, 3), 0.784, places=12)


class Placement(unittest.TestCase):
    def test_matches_society_allies(self):
        for nr in (0, 1, 24, 40):
            for b in (1, 3, 8, 100):
                self.assertEqual(block_placement(200, nr, b), society_allies.block_placement(200, nr, b))


class FixedPoint(unittest.TestCase):
    def test_no_robots_stays_near_the_starting_convention(self):
        x, _ = fixed_point(rho=0.0)
        self.assertLess(x, 0.01)

    def test_all_robots_but_few_tips_everyone(self):
        x, _ = fixed_point(rho=0.5, block=1, k=2)
        self.assertGreater(x, 0.99)

    def test_more_robots_never_lowers_the_fixed_point(self):
        prev = -1
        for rho in (0.04, 0.12, 0.2, 0.3, 0.4):
            x, _ = fixed_point(rho=rho, block=1, k=2)
            self.assertGreaterEqual(x, prev - 1e-9)
            prev = x

    def test_large_block_tips_less_than_spread(self):
        self.assertLess(fixed_point(rho=0.2, block=24, k=2)[0], fixed_point(rho=0.2, block=1, k=2)[0])

    def test_block_front_is_not_frozen_by_rounding(self):
        # Quality audits 2026-11-19: a 1/1000 lookup table pinned this cell at 0.444; the exact
        # binomial map x_i = P(Bin(9, q_i) > 4.5) tips (independent recomputation: about 7,700
        # iterations to 1.0). Fails if the map is rounded, floored or drops the noise term.
        x, it = fixed_point(rho=0.22, block=4, k=2)
        self.assertGreater(x, 0.99)
        self.assertGreater(it, 3000)

    def test_one_step_matches_hand_computed_binomial(self):
        # No robots, one step from x = 0: every partner plays L at the noise rate eps/2 = 0.01,
        # so q = 0.01 and x = P(Bin(9, 0.01) > 4.5) for everyone.
        x, _ = fixed_point(rho=0.0, block=1, k=1, iters=1)
        self.assertAlmostEqual(x, majority_prob(0.01, 9), places=12)


if __name__ == "__main__":
    unittest.main()
