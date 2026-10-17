import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from robofab_solreftimestep.model import G, force_bound, gripper, mass_kg, moving_bound  # noqa: E402
from robofab_solreftimestep.sim import holds  # noqa: E402

CUBE = [(0, 0, 0, 10, 10, 10)]


class T(unittest.TestCase):
    def test_bound_reduces_to_static(self):
        self.assertAlmostEqual(moving_bound(CUBE, 0.5), force_bound(CUBE, 0.5))

    def test_bound_up(self):
        self.assertAlmostEqual(moving_bound(CUBE, 0.5, a_up=G) / force_bound(CUBE, 0.5), 2.0)

    def test_holds_at_600_with_solref_0p2ms(self):
        b = moving_bound(CUBE, 0.6, a_up=600)
        kw = dict(solref=2e-4, dt=1e-4)
        self.assertTrue(holds(CUBE, 0, 1.3 * b, 0.6, a_up=600, **kw))
        self.assertFalse(holds(CUBE, 0, 0.7 * b, 0.6, a_up=600, **kw))

    def test_loose_solref_fails_at_600(self):
        b = moving_bound(CUBE, 0.6, a_up=600)
        self.assertFalse(holds(CUBE, 0, 5 * b + 5.0, 0.6, a_up=600, solref=5e-4, dt=1e-4))

    def test_fine_solref_holds_across_fine_timesteps(self):
        b = moving_bound(CUBE, 0.6, a_up=800)
        for dt in (1e-4, 5e-5):
            self.assertTrue(holds(CUBE, 0, 1.3 * b, 0.6, a_up=800, solref=1e-4, dt=dt))

    def test_parts_have_mass(self):
        for b in gripper().values():
            self.assertGreater(mass_kg(b), 0)


if __name__ == "__main__":
    unittest.main()
