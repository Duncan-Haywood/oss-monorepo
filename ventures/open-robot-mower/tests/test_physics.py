import math
import unittest

from mowerbot import blade, lawns, planner, power, slope


class BladeTest(unittest.TestCase):
    def test_default_blade_meets_the_stop_target_with_braking_only(self):
        r = blade.report()
        self.assertTrue(r.meets_target)
        self.assertGreater(r.stop_s_coast, 5 * r.stop_s_brake)

    def test_braking_matches_the_closed_form_without_drag(self):
        s = blade.BladeSpec(drag_c=0.0)
        J, b, T = s.inertia, s.brake_b, s.friction_nm
        w_end = 30 * 2 * math.pi / 60
        exact = J / b * math.log((s.omega + T / b) / (w_end + T / b))
        self.assertAlmostEqual(blade.stop_time(s, True, dt=1e-5), exact, places=3)

    def test_coasting_matches_the_closed_form_with_friction_only(self):
        s = blade.BladeSpec(drag_c=0.0)
        w_end = 30 * 2 * math.pi / 60
        self.assertAlmostEqual(blade.stop_time(s, False, dt=1e-3), s.inertia * (s.omega - w_end) / s.friction_nm, places=2)

    def test_a_weak_brake_fails_the_target(self):
        self.assertFalse(blade.report(blade.BladeSpec(phase_r=10.0)).meets_target)

    def test_energy_scales_with_rpm_squared(self):
        a = blade.report(blade.BladeSpec(rpm=2000)).stored_energy_j
        b = blade.report(blade.BladeSpec(rpm=4000)).stored_energy_j
        self.assertAlmostEqual(b / a, 4.0)


class SlopeTest(unittest.TestCase):
    def test_wet_grass_is_worse_and_traction_limits_first(self):
        dry, wet = slope.analyse(), slope.analyse(wet=True)
        self.assertLess(wet.limit_deg, dry.limit_deg)
        self.assertIn("traction", dry.limiting)
        self.assertAlmostEqual(dry.tip_side_deg, math.degrees(math.atan(0.192 / 0.123)))

    def test_weight_over_the_drive_wheels_climbs_better(self):
        front = slope.analyse(slope.Chassis(cg_x=0.25)).climb_deg
        rear = slope.analyse(slope.Chassis(cg_x=0.08)).climb_deg
        self.assertGreater(rear, front)

    def test_climb_limit_is_where_traction_equals_demand(self):
        c = slope.Chassis()
        a = math.radians(slope.analyse(c).climb_deg)
        need = math.sin(a) + c.crr * math.cos(a)
        self.assertAlmostEqual(c.mu * slope.rear_load_fraction(c, a, True), need, places=6)


class PowerTest(unittest.TestCase):
    def test_budget_terms(self):
        spec = power.PowerSpec()
        b = power.budget(spec, 0.35, 0.232)
        self.assertAlmostEqual(b.drive_w, spec.mass_kg * 9.81 * spec.crr * 0.35 / spec.drive_eff)
        self.assertGreater(power.budget(spec, 0.35, 0.232, 10).drive_w, b.drive_w)
        self.assertGreater(power.runtime_h(spec, 0.35, 0.232), 1.0)

    def test_a_small_battery_splits_the_job_into_sessions(self):
        lawn = lawns.BACKYARD
        p = planner.plan(lawn)
        one = power.schedule(lawn, p, power.PowerSpec(battery_wh=500))
        many = power.schedule(lawn, p, power.PowerSpec(battery_wh=12))
        self.assertEqual(len(one.sessions), 1)
        self.assertGreaterEqual(len(many.sessions), 3)
        self.assertAlmostEqual(sum(s.mow_m for s in many.sessions), p.length, places=6)
        self.assertGreater(many.total_s, one.total_s)
        for s in many.sessions[:-1]:
            self.assertGreater(s.charge_s, 0)
            self.assertGreaterEqual(s.return_m, 0)


if __name__ == "__main__":
    unittest.main()
