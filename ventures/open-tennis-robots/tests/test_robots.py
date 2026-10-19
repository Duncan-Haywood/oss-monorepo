import math
import os
import random
import sys
import unittest

from tennisbots import ballistics as bl
from tennisbots import catcher, collector, court, drive, protocol, tracker, vision

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "firmware", "esp32"))
sys.modules.setdefault("protocol", protocol)  # firmware imports it by bare name, as on the board
import controller  # noqa: E402


class TrackerTest(unittest.TestCase):
    def _track(self, topspin_rpm, seed=4):
        rng = random.Random(seed)
        v0 = bl.launch_velocity(24.0, math.radians(10), math.radians(178))
        spin = bl.spin_vector(v0, topspin_rpm * bl.RPM)
        truth = bl.simulate((11.5, 1.0, 1.0), v0, spin, max_bounces=0)
        self.assertFalse(truth.hit_net)
        tr = tracker.BallTracker(measurement_sigma=0.03)
        for s in truth.states[::4][:30]:  # 125 Hz for 0.24 s
            tr.observe(s.t, tuple(c + rng.gauss(0, 0.03) for c in s.pos))
        return truth, tr, spin

    def _landing_error(self, truth, pred):
        return math.hypot(pred.first_bounce.pos[0] - truth.first_bounce.pos[0],
                          pred.first_bounce.pos[1] - truth.first_bounce.pos[1])

    def test_estimates_velocity_and_predicts_landing(self):
        v_err, land_err = [], []
        for seed in range(10):
            truth, tr, _ = self._track(0.0, seed)
            t, _, v = tr.estimate()
            true_v = min(truth.states, key=lambda s: abs(s.t - t)).vel
            v_err.append(bl.norm(tuple(a - b for a, b in zip(v, true_v))))
            land_err.append(self._landing_error(truth, tr.predict(max_bounces=0)))
        # 3 cm fixes for 0.24 s: mean errors well under a net width.
        self.assertLess(sum(v_err) / 10, 0.5)
        self.assertLess(sum(land_err) / 10, 0.6)

    def test_unknown_spin_is_the_main_error(self):
        # Topspin the tracker cannot see shortens the real flight; the closed-loop
        # study replans as more frames arrive, which is how the robot copes.
        truth, tr, spin = self._track(1500.0)
        blind = self._landing_error(truth, tr.predict(max_bounces=0))
        told = self._landing_error(truth, tr.predict(max_bounces=0, spin=spin))
        self.assertLess(told, 0.6)
        self.assertGreater(blind, told)

    def test_resets_on_bounce(self):
        tr = tracker.BallTracker(measurement_sigma=0.01)
        for i in range(10):
            tr.observe(i * 0.01, (i * 0.2, 0.0, 1.0 - i * 0.1))
        tr.observe(0.10, (2.0, 0.0, 3.0))  # wildly inconsistent fix
        self.assertEqual(tr.fixes, 1)


class CatcherTest(unittest.TestCase):
    def test_move_is_time_optimal_and_stops(self):
        y, v = catcher.move(0.0, 0.0, 2.0, 3.0, 2.5, 5.0)
        self.assertAlmostEqual(y, 2.0, delta=0.01)
        self.assertAlmostEqual(v, 0.0, delta=0.02)
        # In 0.5 s from rest at 5 m/s^2 the base covers at most 0.625 m.
        y, _ = catcher.move(0.0, 0.0, 3.0, 0.5, 2.5, 5.0)
        self.assertLessEqual(y, 0.63)
        self.assertGreater(y, 0.55)

    def test_plan_reaches_wide_ball(self):
        rig = catcher.CatchRig()
        v = bl.launch_velocity(25.0, math.radians(8), math.atan2(-2.5, -court.HALF_LENGTH - 11.5))
        f = bl.simulate((11.5, 0.0, 1.0), v, max_bounces=3)
        p = catcher.plan(f, 0.0, 0.0, 0.0, rig)
        self.assertIsNotNone(p)
        self.assertTrue(p.catchable)
        self.assertLess(p.cross_y, -1.0)

    def test_moving_net_beats_fixed_net(self):
        moving = catcher.study(40, catcher.CatchRig(net_width=2.0), seed=7)
        fixed = catcher.study(40, catcher.CatchRig(net_width=2.0, max_speed=1e-9), seed=7)
        self.assertEqual(moving.returns, 40)
        self.assertGreater(moving.catch_rate, fixed.catch_rate + 0.3)


class CollectorTest(unittest.TestCase):
    def test_segment_rect(self):
        r = court.Rect(0, 0, 1, 1)
        self.assertTrue(collector.segment_hits_rect((-1, 0.5), (2, 0.5), r))
        self.assertFalse(collector.segment_hits_rect((-1, 2), (2, 2), r))
        self.assertFalse(collector.segment_hits_rect((-1, 1), (2, 1), r))  # along an edge

    def test_detours_around_keep_out(self):
        p = collector.Planner([court.Rect(-1, -1, 1, 1)], rover_half_width=0.2, clearance=0.0)
        length, pts = p.path((-3, 0), (3, 0))
        self.assertGreater(length, 6.0)
        self.assertTrue(all(p.clear(a, b) for a, b in zip(pts, pts[1:])))

    def test_route_visits_every_reachable_ball_and_dumps(self):
        rng = random.Random(2)
        balls = [(rng.uniform(-13, 13), rng.uniform(-6, 6)) for _ in range(80)]
        p = collector.Planner(collector.practice_zones())
        r = p.collect((-14.0, 6.0), balls, capacity=20)
        self.assertEqual(r.picks + len(r.skipped), 80)
        self.assertGreaterEqual(sum(1 for e, _ in r.events if e == "dump"), math.ceil(r.picks / 20))
        self.assertTrue(all(p.clear(a, b) for a, b in zip(r.waypoints, r.waypoints[1:])))
        self.assertTrue(all(not p.blocked(b) for e, b in r.events if e == "pick"))

    def test_two_opt_not_worse_than_greedy_baseline(self):
        balls = [(float(x), float(y)) for x in range(5) for y in (0, 3)]
        p = collector.Planner()
        tour = p.order((0.0, -1.0), balls)
        length = sum(math.dist(a, b) for a, b in zip([(0.0, -1.0)] + tour, tour))
        self.assertLessEqual(length, 4 + 3 + 4 + 1 + 1e-6)

    def test_sweep_covers_lanes_and_avoids_zone(self):
        p = collector.Planner([court.Rect(2, 2, 4, 4)], rover_half_width=0.25, clearance=0.0)
        pts = p.sweep(court.Rect(0, 0, 6, 6), 0.5)
        ys = sorted({round(y, 3) for _, y in pts})
        self.assertGreaterEqual(len(ys), 11)
        self.assertTrue(all(p.clear(a, b) for a, b in zip(pts, pts[1:])))


class DriveTest(unittest.TestCase):
    def test_follows_path_to_goal(self):
        pose, t = drive.follow([(0, 0), (4, 0), (4, 4)], drive.Pose(0, 0, 0))
        self.assertLess(math.hypot(pose.x - 4, pose.y - 4), 0.1)
        self.assertLess(t, 60)

    def test_wheel_speeds_respect_limit(self):
        d = drive.DiffDrive(max_wheel_speed=1.0)
        left, right = d.wheels(1.0, 5.0)
        self.assertLessEqual(max(abs(left), abs(right)), 1.0 + 1e-9)


class VisionTest(unittest.TestCase):
    def test_homography_roundtrip(self):
        # A synthetic perspective camera.
        true = vision.Homography([0.02, 0.001, -5.0, 0.0005, 0.05, -12.0, 0.00001, 0.002, 1.0])
        pixels = [(100, 400), (1200, 420), (900, 120), (300, 110), (640, 300), (50, 250)]
        ground = [true.to_ground(u, v) for u, v in pixels]
        fit = vision.Homography.fit(pixels, ground)
        for u, v in [(700, 200), (200, 380)]:
            a, b = true.to_ground(u, v), fit.to_ground(u, v)
            self.assertAlmostEqual(a[0], b[0], places=5)
            self.assertAlmostEqual(a[1], b[1], places=5)

    def test_degenerate_points(self):
        with self.assertRaises(ValueError):
            vision.Homography.fit([(0, 0), (1, 1), (2, 2), (3, 3)], [(0, 0), (1, 1), (2, 2), (3, 3)])


class ProtocolTest(unittest.TestCase):
    def test_roundtrip_with_noise_and_split_reads(self):
        frames = [protocol.encode(protocol.SET_WHEELS, 4200, 2100), protocol.encode(protocol.FEED, 1),
                  protocol.encode(protocol.HEARTBEAT), protocol.encode(protocol.DRIVE, -300, 450)]
        stream = b"\x00\xff" + frames[0] + b"\xa5\x10\x04garbage" + b"".join(frames[1:])
        d = protocol.Decoder()
        out = []
        for i in range(0, len(stream), 3):
            out += d.feed(stream[i:i + 3])
        self.assertEqual(out, [(protocol.SET_WHEELS, (4200, 2100)), (protocol.FEED, (1,)),
                               (protocol.HEARTBEAT, ()), (protocol.DRIVE, (-300, 450))])
        self.assertGreaterEqual(d.errors, 1)

    def test_corrupt_crc_dropped(self):
        f = bytearray(protocol.encode(protocol.FEED, 2))
        f[-1] ^= 0xFF
        self.assertEqual(protocol.Decoder().feed(bytes(f)), [])


class FakeHw:
    def __init__(self):
        self.log = []
        self.button = False
        self.bump = False

    def __getattr__(self, name):
        def rec(*a):
            self.log.append((name,) + a)
        return rec

    def estop_pressed(self):
        return self.button

    def bumper(self):
        return self.bump

    def flags(self):
        return 0

    def base_y_mm(self):
        return 120

    def rpm(self):
        return (4000, 2000)

    def battery_mv(self):
        return 25600


class FirmwareTest(unittest.TestCase):
    def test_commands_and_role_filter(self):
        hw = FakeHw()
        c = controller.Controller(hw, controller.ROLE_FEEDER, 0)
        c.tick(protocol.encode(protocol.SET_WHEELS, 9000, 3000) + protocol.encode(protocol.DRIVE, 100, 100), 10)
        self.assertIn(("set_launch_rpm", controller.MAX_RPM, 3000), hw.log)
        self.assertFalse(any(e[0] == "drive" for e in hw.log))
        self.assertEqual(c.rejected, 1)

    def test_watchdog_stops_and_recovers(self):
        hw = FakeHw()
        c = controller.Controller(hw, controller.ROLE_FEEDER, 0)
        c.tick(protocol.encode(protocol.HEARTBEAT), 100)
        hw.log.clear()
        c.tick(b"", 100 + controller.WATCHDOG_MS + 1)
        self.assertTrue(c.watchdog_tripped)
        self.assertIn(("stop_all",), hw.log)
        c.tick(protocol.encode(protocol.FEED, 1), 500)
        self.assertNotIn(("feed", 1), hw.log)
        c.tick(protocol.encode(protocol.HEARTBEAT) + protocol.encode(protocol.FEED, 1), 510)
        self.assertIn(("feed", 1), hw.log)

    def test_physical_estop_latches(self):
        hw = FakeHw()
        c = controller.Controller(hw, controller.ROLE_FEEDER, 0)
        hw.button = True
        c.tick(protocol.encode(protocol.HEARTBEAT), 10)
        self.assertTrue(c.estop)
        c.tick(protocol.encode(protocol.CLEAR_ESTOP), 20)
        self.assertTrue(c.estop)  # still held down
        hw.button = False
        c.tick(protocol.encode(protocol.CLEAR_ESTOP), 30)
        self.assertFalse(c.estop)

    def test_bumper_allows_only_reverse(self):
        hw = FakeHw()
        c = controller.Controller(hw, controller.ROLE_COLLECTOR, 0)
        hw.bump = True
        c.tick(protocol.encode(protocol.DRIVE, 300, 300), 10)
        self.assertEqual(hw.log[-1], ("drive", 0, 0))
        c.tick(protocol.encode(protocol.DRIVE, -200, -200), 20)
        self.assertEqual(hw.log[-1], ("drive", -200, -200))

    def test_telemetry(self):
        hw = FakeHw()
        c = controller.Controller(hw, controller.ROLE_FEEDER, 0)
        out = c.tick(protocol.encode(protocol.ESTOP), controller.TELEMETRY_MS)
        (cmd, vals), = protocol.Decoder().feed(out)
        self.assertEqual(cmd, protocol.TELEMETRY)
        self.assertTrue(vals[0] & protocol.FLAG_ESTOP)
        self.assertEqual(vals[1:], (120, 4000, 2000, 25600))


if __name__ == "__main__":
    unittest.main()
