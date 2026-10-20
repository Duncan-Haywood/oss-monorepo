import math
import unittest

from tennisbots import ballistics as bl
from tennisbots import court, launcher


class BallisticsTest(unittest.TestCase):
    def test_vacuum_matches_closed_form(self):
        ball = bl.with_overrides(bl.DEFAULT_BALL, air_density=0.0)
        v = bl.launch_velocity(15.0, math.radians(30), 0.0)
        f = bl.simulate((0.5, 0.0, ball.radius), v, ball=ball, max_bounces=0, net=False)
        expected = 15.0 ** 2 * math.sin(math.radians(60)) / ball.gravity
        self.assertAlmostEqual(f.first_bounce.pos[0] - 0.5, expected, delta=0.02)

    def test_drag_shortens_and_topspin_dips(self):
        v = bl.launch_velocity(25.0, math.radians(12), 0.0)
        origin = (-12.4, 0.0, 1.0)
        flat = bl.simulate(origin, v, max_bounces=0)
        top = bl.simulate(origin, v, bl.spin_vector(v, 2500 * bl.RPM), max_bounces=0)
        back = bl.simulate(origin, v, bl.spin_vector(v, -1500 * bl.RPM), max_bounces=0)
        vac = bl.simulate(origin, v, ball=bl.with_overrides(bl.DEFAULT_BALL, air_density=0.0), max_bounces=0)
        self.assertLess(flat.first_bounce.pos[0], vac.first_bounce.pos[0])
        self.assertLess(top.first_bounce.pos[0], flat.first_bounce.pos[0])
        self.assertGreater(back.first_bounce.pos[0], flat.first_bounce.pos[0])

    def test_sidespin_curves_left(self):
        v = bl.launch_velocity(20.0, math.radians(15), 0.0)
        f = bl.simulate((-12.4, 0.0, 1.0), v, bl.spin_vector(v, 0.0, 1500 * bl.RPM), max_bounces=0)
        self.assertGreater(f.first_bounce.pos[1], 0.1)

    def test_drop_rebound_in_itf_range(self):
        # ITF: dropped from 254 cm, a ball rebounds 135-147 cm. Coefficients are defaults.
        f = bl.simulate((0.5, 0.0, 2.54), (0.0, 0.0, 0.0), max_bounces=1, net=False)
        after = [s.pos[2] for s in f.states if s.t > f.bounces[0].t]
        self.assertGreater(max(after), 1.30)
        self.assertLess(max(after), 1.50)

    def test_bounce_conserves_or_loses_energy_and_topspin_kicks(self):
        v = (20.0, 0.0, -6.0)
        for top in (-3000, 0, 1500, 4000):
            spin = bl.spin_vector(v, top * bl.RPM)
            vo, so = bl.bounce(v, spin)
            b = bl.DEFAULT_BALL
            e_in = 0.5 * b.mass * bl.dot(v, v) + 0.5 * b.inertia_factor * b.mass * b.radius ** 2 * bl.dot(spin, spin)
            e_out = 0.5 * b.mass * bl.dot(vo, vo) + 0.5 * b.inertia_factor * b.mass * b.radius ** 2 * bl.dot(so, so)
            self.assertLessEqual(e_out, e_in + 1e-9, top)
            self.assertAlmostEqual(vo[2], 6.0 * b.restitution)
        flat, _ = bl.bounce(v, (0.0, 0.0, 0.0))
        kick, _ = bl.bounce(v, bl.spin_vector(v, 4000 * bl.RPM))
        self.assertGreater(kick[0], flat[0])

    def test_net_is_detected(self):
        v = bl.launch_velocity(20.0, math.radians(-2), 0.0)
        f = bl.simulate((-6.0, 0.0, 1.0), v, max_bounces=0)
        self.assertTrue(f.hit_net or f.first_bounce.pos[0] < 0)
        self.assertEqual(court.net_height(0.0), court.NET_HEIGHT_CENTRE)
        self.assertEqual(court.net_height(99.0), court.NET_HEIGHT_POST)


class LauncherTest(unittest.TestCase):
    def test_wheel_rpm_roundtrip(self):
        w = launcher.WheelLauncher()
        rt, rb = w.wheel_rpm(22.0, 1800 * bl.RPM)
        speed, spin = w.exit(rt, rb)
        self.assertAlmostEqual(speed, 22.0, places=6)
        self.assertAlmostEqual(spin, 1800 * bl.RPM, places=6)
        self.assertGreater(rt, rb)

    def test_wheel_limits(self):
        w = launcher.WheelLauncher()
        with self.assertRaises(ValueError):
            w.wheel_rpm(60.0, 0.0)
        with self.assertRaises(ValueError):
            w.wheel_rpm(5.0, 5000 * bl.RPM)

    def test_calibrate_recovers_efficiencies(self):
        truth = launcher.WheelLauncher(speed_efficiency=0.78, spin_efficiency=0.41)
        samples = []
        for rt, rb in ((3000, 3000), (4000, 2500), (3500, 1800), (2000, 2600)):
            v, w = truth.exit(rt, rb)
            samples.append((rt, rb, v, w / bl.RPM))
        fit = launcher.calibrate(samples)
        self.assertAlmostEqual(fit.speed_efficiency, 0.78, places=6)
        self.assertAlmostEqual(fit.spin_efficiency, 0.41, places=6)

    def test_aim_hits_target(self):
        origin = launcher.default_origin(1.0)
        for target, speed, top in (((9.0, -2.5), 22.0, 1200.0), ((4.0, 3.0), 15.0, 0.0), ((10.5, 0.0), 30.0, 2500.0)):
            shot = launcher.aim(origin, target, speed, top)
            self.assertAlmostEqual(shot.landing[0], target[0], delta=0.02)
            self.assertAlmostEqual(shot.landing[1], target[1], delta=0.02)
            self.assertGreater(shot.net_clearance, 0.15)

    def test_aim_rejects_unreachable(self):
        with self.assertRaises(ValueError):
            launcher.aim(launcher.default_origin(), (11.0, 0.0), 8.0)


if __name__ == "__main__":
    unittest.main()
