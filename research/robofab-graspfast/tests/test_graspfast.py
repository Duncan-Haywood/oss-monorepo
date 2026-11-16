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

    def test_bound_combined_load_is_resultant(self):
        # 3-4-5 triangle: g + a_up = 3g and a_side = 4g give a resultant of 5g, so 5x the static bound.
        # A sum (3g + 4g = 7g) or a max (4g) would both fail this.
        self.assertAlmostEqual(moving_bound(CUBE, 0.5, a_up=2 * G, a_side=4 * G) / force_bound(CUBE, 0.5), 5.0)

    def test_bound_hand_values(self):
        # cover 40 x 30 x 4 mm at 1240 kg/m^3 = 5.952 g; per-jaw bound at 400 m/s^2 up, mu 0.5:
        # 0.005952 * 409.81 / (2 * 0.5) = 2.43919 N (results.txt Table A cover up400 bound 2.4392)
        cover = gripper()["cover"]
        self.assertAlmostEqual(mass_kg(cover), 0.005952, places=9)
        self.assertAlmostEqual(moving_bound(cover, 0.5, a_up=400), 0.005952 * 409.81, places=6)
        # mixed rows of Table A (results.txt): link and finger_a at 200 up / 100 side
        self.assertAlmostEqual(moving_bound(gripper()["link"], 0.5, 200, 100), 0.0830, places=4)
        self.assertAlmostEqual(moving_bound(gripper()["finger_a"], 0.5, 200, 100), 0.3689, places=4)

    def test_hold_mixed_load_fine_settings(self):
        # the combined-load bound is right in the simulator within 10% (elliptic cone):
        # holds at 1.1x, slips at 0.9x for 300 m/s^2 up and 300 m/s^2 sideways at once
        b = moving_bound(CUBE, 0.6, a_up=300, a_side=300)
        self.assertTrue(holds(CUBE, 0, 1.1 * b, 0.6, a_up=300, a_side=300, **FINE))
        self.assertFalse(holds(CUBE, 0, 0.9 * b, 0.6, a_up=300, a_side=300, **FINE))

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
