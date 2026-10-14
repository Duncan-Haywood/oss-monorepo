import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from robofab_grasp.model import contact_area, force_bound, gripper, grasp_options, mass_kg  # noqa: E402
from robofab_grasp.sim import holds  # noqa: E402

CUBE = [(0, 0, 0, 10, 10, 10)]


class T(unittest.TestCase):
    def test_mass(self):
        self.assertAlmostEqual(mass_kg(CUBE), 1240.0 * 1e-6, places=9)  # 1 cm^3 of PLA-like

    def test_bound_scales(self):
        self.assertAlmostEqual(force_bound(CUBE, 0.25) / force_bound(CUBE, 0.5), 2.0)

    def test_contact_area_partial_face(self):
        l_shape = [(0, 0, 0, 10, 10, 2), (0, 0, 2, 2, 10, 10)]
        self.assertAlmostEqual(contact_area(l_shape, 0, 1), 10 * 2)   # x-high face: only the foot
        self.assertAlmostEqual(contact_area(l_shape, 0, 0), 10 * 2 + 10 * 8)

    def test_jaw_opening(self):
        self.assertEqual(grasp_options(CUBE, 30.0)[0]["width"], 10)
        self.assertEqual(grasp_options([(0, 0, 0, 40, 40, 5)], 30.0), [])

    def test_mujoco_hold_and_drop(self):
        self.assertTrue(holds(CUBE, 0, 0.5, 0.6))
        self.assertFalse(holds(CUBE, 0, 0.0, 0.6))   # no grip force: the part falls

    def test_all_parts_have_mass(self):
        for n, b in gripper().items():
            self.assertGreater(mass_kg(b), 0)


if __name__ == "__main__":
    unittest.main()
