import math, pathlib, sys, unittest
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / "src"))
from selfrep_alufring import ring


class T(unittest.TestCase):
    def test_step_is_static_deflection(self):
        k = ring.m.stiffness("steel", 0.01, ring.L)
        self.assertAlmostEqual(ring.ring_amplitude("steel", 0.01, 2.0), ring.m.M_CARRIAGE * 2.0 / k)

    def test_ramp_of_one_period_cancels_ringing(self):
        T0 = 1 / ring.m.frequency("steel", 0.01, ring.L)
        self.assertLess(ring.ring_amplitude("steel", 0.01, 2.0, T0), 1e-12)

    def test_ramp_never_worse_than_step(self):
        self.assertLessEqual(ring.ring_amplitude("aluminium", 0.01, 2.0, 0.02), ring.ring_amplitude("aluminium", 0.01, 2.0))

    def test_min_diameter_meets_budget_and_is_tight(self):
        d = ring.min_diameter("aluminium", 3.0)
        self.assertGreaterEqual(ring.max_accel("aluminium", d), 3.0 - 1e-6)
        self.assertLess(ring.max_accel("aluminium", d * 0.99), 3.0)

    def test_steel_stiffer_than_aluminium_than_wood(self):
        a = [ring.min_diameter(x, 3.0) for x in ("steel", "aluminium", "hardwood")]
        self.assertLess(a[0], a[1]); self.assertLess(a[1], a[2])

    def test_settle_time_scales_inversely_with_omega(self):
        self.assertAlmostEqual(ring.settle_time("steel", 0.01), math.log(10) / (0.01 * ring.omega("steel", 0.01)))
