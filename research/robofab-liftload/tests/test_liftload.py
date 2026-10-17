import math
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from robofab_liftload.model import G, bar, com_offset_mm, effective_load, force_bound, mass_kg, torque_bounds  # noqa: E402
from robofab_liftload.parts import gripper, grasp_options  # noqa: E402
from robofab_liftload.sim import holds  # noqa: E402

CUBE = [(0, 0, 0, 10, 10, 10)]


class T(unittest.TestCase):
    def test_effective_load(self):
        self.assertAlmostEqual(effective_load(0, 0), G)
        self.assertAlmostEqual(effective_load(0, G), G * math.sqrt(2))

    def test_bound_scales_with_load(self):
        self.assertAlmostEqual(force_bound(CUBE, 0.5, az=G) / force_bound(CUBE, 0.5), 2.0)

    def test_com_offset(self):
        self.assertAlmostEqual(com_offset_mm(CUBE, 0), 0.0)
        self.assertAlmostEqual(com_offset_mm(bar(40), 0), 0.0)
        l_shape = [(0, 0, 0, 10, 10, 2), (0, 0, 2, 2, 10, 10)]  # asymmetric about x
        self.assertGreater(com_offset_mm(l_shape, 1 - 1), 1.0)

    def test_torque_bracket(self):
        b = torque_bounds(10, 0.5)
        self.assertAlmostEqual(b["torque_only"], 0.0)
        b = torque_bounds(40, 0.5)
        self.assertLess(b["lower"], b["upper"])
        self.assertAlmostEqual(b["upper"], b["force_only"] + b["torque_only"])

    def test_mujoco_lift_needs_more_force(self):
        f = force_bound(CUBE, 0.6, az=20.0)
        self.assertTrue(holds(CUBE, 0, 1.3 * f + 0.01, 0.6, az=20.0))
        self.assertFalse(holds(CUBE, 0, 0.5 * force_bound(CUBE, 0.6), 0.6, az=20.0))

    def test_parts(self):
        for n, b in gripper().items():
            self.assertGreater(mass_kg(b), 0)
        self.assertEqual([o["axis"] for o in grasp_options(gripper()["cover"])], [1])


if __name__ == "__main__":
    unittest.main()
