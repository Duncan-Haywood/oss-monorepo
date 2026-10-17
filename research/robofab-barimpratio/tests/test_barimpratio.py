import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from robofab_barimpratio.model import G, bar, mass_kg, point_contact_bound, torque_bounds  # noqa: E402
from robofab_barimpratio.sim import holds, mjcf  # noqa: E402

WIN = (1, 0, 10)


class T(unittest.TestCase):
    def test_centred_bar_reduces_to_force_bound(self):
        # d = 0 for a 10 mm bar: no moment, so the point-contact bound is m g / (2 mu)
        self.assertAlmostEqual(point_contact_bound(10, 0.5), mass_kg(bar(10)) * G, delta=1e-4 * mass_kg(bar(10)) * G)

    def test_single_point_has_no_torque_capacity_at_pad_centre(self):
        # one contact at the pad centre carries only force, so an off-centre bar needs more than the force bound
        f = mass_kg(bar(40)) * G / (2 * 0.5)
        self.assertGreater(point_contact_bound(40, 0.5, points=((5.0, 5.0),)), f)

    def test_more_spread_contacts_need_less_force(self):
        spread = point_contact_bound(40, 0.5)
        centre = point_contact_bound(40, 0.5, points=((5.0, 5.0),))
        self.assertLess(spread, centre)

    def test_bound_scales_inversely_with_mu(self):
        self.assertAlmostEqual(point_contact_bound(40, 0.25) / point_contact_bound(40, 0.5), 2.0, places=3)

    def test_uniform_bracket_exceeds_point_contact_bound(self):
        self.assertGreater(torque_bounds(40, 0.5)["lower"], point_contact_bound(40, 0.5))

    def test_impratio_is_written_to_the_model(self):
        self.assertIn('impratio="100"', mjcf(bar(40), 0, 0.5, 0, 0, win=WIN, impratio=100))

    def test_bar_holds_at_a_generous_force_and_falls_at_none(self):
        self.assertTrue(holds(bar(40), 0, 2.0, 0.5, win=WIN, impratio=100, rot_deg=1.0))
        self.assertFalse(holds(bar(40), 0, 0.0, 0.5, win=WIN, impratio=100))


if __name__ == "__main__":
    unittest.main()
