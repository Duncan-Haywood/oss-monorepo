import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from robofab_graspfast.model import G, force_bound, gripper, mass_kg, moving_bound  # noqa: E402
from robofab_graspfast.sim import holds  # noqa: E402

CUBE = [(0, 0, 0, 10, 10, 10)]
FINE = dict(solref=0.0001, dt=0.00005)


class T(unittest.TestCase):
    def test_bound_reduces_to_static(self):
        self.assertAlmostEqual(moving_bound(CUBE, 0.5), force_bound(CUBE, 0.5))

    def test_bound_up(self):
        self.assertAlmostEqual(moving_bound(CUBE, 0.5, a_up=G) / force_bound(CUBE, 0.5), 2.0)

    def test_hold_at_400_up_fine_settings(self):
        b = moving_bound(CUBE, 0.6, a_up=400)
        self.assertTrue(holds(CUBE, 0, 1.3 * b, 0.6, a_up=400, **FINE))
        self.assertFalse(holds(CUBE, 0, 0.7 * b, 0.6, a_up=400, **FINE))

    def test_hold_at_800_side_fine_settings(self):
        b = moving_bound(CUBE, 0.6, a_side=800)
        self.assertTrue(holds(CUBE, 0, 1.3 * b, 0.6, a_side=800, **FINE))
        self.assertFalse(holds(CUBE, 0, 0.7 * b, 0.6, a_side=800, **FINE))

    def test_default_settings_artefact_at_400(self):
        # at the graspmove settings the contact lag shows as slip even with a generous force
        b = moving_bound(CUBE, 0.6, a_up=400)
        self.assertFalse(holds(CUBE, 0, 5 * b + 5.0, 0.6, a_up=400))

    def test_parts_have_mass(self):
        for b in gripper().values():
            self.assertGreater(mass_kg(b), 0)


if __name__ == "__main__":
    unittest.main()
