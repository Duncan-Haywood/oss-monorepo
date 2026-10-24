import math, unittest
from osrobot_plate.model import *


class T(unittest.TestCase):
    def test_trap(self):
        self.assertEqual(trap_time(0, 1, 1), 0.0)
        self.assertAlmostEqual(trap_time(0.5, 1, 1), 2 * math.sqrt(0.5))
        self.assertAlmostEqual(trap_time(3, 1, 1), 4.0)

    def test_ik_roundtrip(self):
        q = ik(0.3, 0.2)
        x = ARM["l1"] * math.cos(q[0]) + ARM["l2"] * math.cos(q[0] + q[1])
        y = ARM["l1"] * math.sin(q[0]) + ARM["l2"] * math.sin(q[0] + q[1])
        self.assertAlmostEqual(x, 0.3, places=9); self.assertAlmostEqual(y, 0.2, places=9)

    def test_whole_deck_in_arm_reach(self):
        for r in (0, ROWS - 1):
            for c in (0, COLS - 1):
                self.assertIsNotNone(ik(*well(r, c)))
        self.assertIsNotNone(ik(*TROUGH))

    def test_eight_channels_faster(self):
        for kind in ("gantry", "arm"):
            self.assertLess(plate_time(kind, 8, 10), plate_time(kind, 1, 10))

    def test_serpentine_not_slower_than_row_order(self):
        self.assertLessEqual(plate_time("gantry", 1, 200, "serpentine"), plate_time("gantry", 1, 200, "row") + 1e-9)

    def test_bigger_volume_needs_more_trips(self):
        self.assertGreater(plate_time("gantry", 1, 100), plate_time("gantry", 1, 5))

    def test_dispense_count_floor(self):
        # one channel, 96 dispenses of 0.5 s each is a lower bound
        self.assertGreater(plate_time("gantry", 1, 10), 96 * T_DISP)

if __name__ == "__main__":
    unittest.main()
