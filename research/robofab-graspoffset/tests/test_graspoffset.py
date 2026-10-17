import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from robofab_graspoffset.model import G, ball_required_force, flat_required_force, mass_kg  # noqa: E402
from robofab_graspoffset.sim import holds  # noqa: E402

L, MU, MUT = 20.0, 0.5, 0.002


class T(unittest.TestCase):
    def test_zero_offset_is_slip_bound(self):
        slip = mass_kg(L) * G / (2 * MU)
        self.assertAlmostEqual(ball_required_force(L, 0, MU, MUT), slip)
        self.assertAlmostEqual(flat_required_force(L, 0, MU), slip, places=6)

    def test_ball_grows_with_offset(self):
        self.assertGreater(ball_required_force(L, 10, MU, MUT), 2 * ball_required_force(L, 0, MU, MUT))

    def test_flat_interval_ordered(self):
        for d in (0, 5, 10, 20):
            self.assertLessEqual(flat_required_force(L, d, MU, "best"), flat_required_force(L, d, MU) + 1e-12)

    def test_flat_beats_ball_at_large_offset(self):
        self.assertLess(flat_required_force(L, 10, MU), ball_required_force(L, 10, MU, MUT))

    def test_ball_hold_above_and_fail_below(self):
        b = ball_required_force(L, 8, MU, MUT)
        self.assertTrue(holds(L, 8, 1.2 * b, MU, MUT, "ball"))
        self.assertFalse(holds(L, 8, 0.8 * b, MU, MUT, "ball"))

    def test_flat_holds_at_upper_bound(self):
        self.assertTrue(holds(L, 10, 1.1 * flat_required_force(L, 10, MU), MU, MUT, "flat"))
        self.assertFalse(holds(L, 10, 0.8 * flat_required_force(L, 10, MU, "best"), MU, MUT, "flat"))


if __name__ == "__main__":
    unittest.main()
