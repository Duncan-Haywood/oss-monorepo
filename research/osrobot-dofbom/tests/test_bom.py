import os, sys, unittest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from osrobot_dofbom.bom import *


class BomTests(unittest.TestCase):
    def test_reproduces_published_follower_total(self):
        # SO-ARM101 "Parts for One Follower Arm": six servos, board, cable, PSU, 2 clamps, screwdrivers = $121.94
        self.assertAlmostEqual(total(5, gripper=True), 121.94, places=2)

    def test_reproduces_published_two_arm_total(self):
        # "Parts For Two Arms": 12 servos, 2 boards, 1 USB pack, 2 PSUs, 1 four-clamp pack ($9), screwdrivers = $229.88
        t = 12 * 13.89 + 2 * 10.6 + 7 + 2 * 10 + 9 + 6
        self.assertAlmostEqual(t, 229.88, places=2)

    def test_total_grows_by_one_servo_per_joint(self):
        for n in range(2, 6):
            self.assertAlmostEqual(total(n + 1) - total(n), 13.89, places=6)

    def test_ratio_is_below_servo_only_ratio(self):
        self.assertLess(ratio(6, 2), 3.0)
        self.assertGreater(ratio(6, 2), 1.0)

    def test_fixed_share_falls_with_joints(self):
        self.assertGreater(fixed_share(2), fixed_share(6))

    def test_expensive_servos_push_ratio_toward_three(self):
        self.assertGreater(ratio(6, 2, servo_usd=49.22), ratio(6, 2, servo_usd=13.89))
        self.assertLess(ratio(6, 2, servo_usd=49.22), 3.0)

    def test_printed_range_is_small(self):
        lo, hi = FILAMENT_USD_PER_KG
        self.assertLess(bom(2, filament_usd_per_kg=hi)["printed"], 5.0)
        self.assertEqual(bom(2, filament_usd_per_kg=lo)["printed"], bom(6, filament_usd_per_kg=lo)["printed"])

    def test_no_joints_rejected(self):
        with self.assertRaises(ValueError):
            bom(0)


if __name__ == "__main__":
    unittest.main()
