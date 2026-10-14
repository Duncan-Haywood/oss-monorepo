import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from robofab_graspmove.model import G, force_bound, gripper, mass_kg, moving_bound  # noqa: E402
from robofab_graspmove.sim import holds  # noqa: E402

CUBE = [(0, 0, 0, 10, 10, 10)]


class T(unittest.TestCase):
    def test_bound_reduces_to_static(self):
        self.assertAlmostEqual(moving_bound(CUBE, 0.5), force_bound(CUBE, 0.5))

    def test_bound_up(self):
        self.assertAlmostEqual(moving_bound(CUBE, 0.5, a_up=G) / force_bound(CUBE, 0.5), 2.0)

    def test_bound_side(self):
        self.assertAlmostEqual(moving_bound(CUBE, 0.5, a_side=G) / force_bound(CUBE, 0.5), 2 ** 0.5)

    def test_hold_while_lifting(self):
        b = moving_bound(CUBE, 0.6, a_up=20)
        self.assertTrue(holds(CUBE, 0, 1.3 * b, 0.6, a_up=20))
        self.assertFalse(holds(CUBE, 0, 0.7 * b, 0.6, a_up=20))

    def test_hold_while_sliding_sideways(self):
        b = moving_bound(CUBE, 0.6, a_side=20)
        self.assertTrue(holds(CUBE, 0, 1.3 * b, 0.6, a_side=20))
        self.assertFalse(holds(CUBE, 0, 0.7 * b, 0.6, a_side=20))

    def test_soft_contact_artefact(self):
        # with the slow contact time constant the part appears to slip at any force
        self.assertFalse(holds(CUBE, 0, 20.0, 0.6, a_up=10, solref=0.004))

    def test_parts_have_mass(self):
        for b in gripper().values():
            self.assertGreater(mass_kg(b), 0)


if __name__ == "__main__":
    unittest.main()
